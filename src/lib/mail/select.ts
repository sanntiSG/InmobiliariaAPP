/**
 * Qué propiedades de la inmobiliaria menciona un mail. Siempre y SÓLO del catálogo de ESA inmobiliaria (cada filtro lleva su
 * `agencyId`): jamás se cuela una propiedad de otra. Tres pistas, de la más fuerte a la más débil: un enlace a nuestra ficha,
 * el nombre de una publicación y, si no nombra ninguna, lo que pide ("departamento en alquiler en Palermo") para sugerir
 * opciones. Usa el mismo entendimiento del lenguaje que el asesor.
 */
import { Types } from "mongoose";
import { Property } from "@/lib/db/models/Property";
import { memo } from "@/lib/intelligence/cache";
import { buildSearchFilter } from "@/lib/advisor/data/market";
import { buildEntityIndex, type EntityIndex } from "@/lib/advisor/nlu/entities";
import { toFacts, type PropertyDocLike, type PropertyFacts } from "@/lib/agents/knowledge/facts";
import { extractSlugs } from "./refs";
import { readRequest, searchSignal, type SearchSignal } from "./signals";

const FIELDS = "status slug title description type operation price address features amenities media.hasTour3d media.hasAmbientCover media.videos";

export type MailSelection = {
  /** Propiedades publicadas de la inmobiliaria a las que se refiere el mail. */
  properties: PropertyFacts[];
  /** Nombra una propiedad que existe pero ya no está publicada. */
  unavailable: boolean;
  /** Sugerencias (parecidas a la que ya no está, o lo que encaja con lo que pide). */
  alternatives: PropertyFacts[];
  /** Lo que pide el mail (tipo, operación, lugar…), leído con las zonas y títulos reales de la inmobiliaria. */
  search: SearchSignal;
  /** Las sugerencias no coinciden con lo que pidió: son lo más reciente de la inmobiliaria. */
  fallback: boolean;
};

function agencyIndex(agencyId: string): Promise<EntityIndex> {
  return memo(`agents:mail-index:${agencyId}`, 60_000, async () => {
    const docs = await Property.find({ agencyId, status: "published" }).select("title address.neighborhood address.city").limit(500).lean();
    const zones = docs.flatMap((d) => [d.address?.neighborhood, d.address?.city]).filter((z): z is string => typeof z === "string" && z.trim().length > 1);
    return buildEntityIndex({ zones, properties: docs.map((d) => ({ id: String(d._id), title: d.title })) });
  });
}

const load = (filter: Record<string, unknown>, limit: number) => Property.find(filter).select(FIELDS).sort({ publishedAt: -1 }).limit(limit).lean();
const factsOf = (docs: unknown[]): PropertyFacts[] => docs.map((d) => toFacts(d as PropertyDocLike));

export async function selectForMail(agencyId: string, mail: { subject: string; text: string }, siteHosts: readonly string[], max: number): Promise<MailSelection> {
  const agency = new Types.ObjectId(agencyId);
  const body = `${mail.subject}\n${mail.text}`;

  // 1) Enlaces a nuestras fichas.
  const slugs = extractSlugs(body, siteHosts);
  let unavailable = false;
  // Lo que pide se lee siempre (con las zonas y títulos reales de la inmobiliaria): sirve para entender y para redactar.
  const index = await agencyIndex(agencyId);
  const { slots } = readRequest(mail.subject, mail.text, index);
  const search = searchSignal(slots, body);

  if (slugs.length > 0) {
    const docs = await load({ agencyId: agency, slug: { $in: slugs } }, 10);
    const published = docs.filter((d) => d.status === "published");
    unavailable = docs.length > published.length;
    if (published.length > 0) return { properties: factsOf(published).slice(0, max), unavailable: false, alternatives: [], search, fallback: false };
  }

  // 2) El nombre de una publicación, o lo que pide.
  const ids = (slots.propertyIds ?? []).filter((id) => Types.ObjectId.isValid(id)).slice(0, max);
  if (ids.length > 0) {
    const docs = await load({ _id: { $in: ids.map((i) => new Types.ObjectId(i)) }, agencyId: agency, status: "published" }, max);
    if (docs.length > 0) return { properties: factsOf(docs), unavailable: false, alternatives: [], search, fallback: false };
  }

  const wants = !!(slots.zones?.length || slots.types?.length || slots.operation || slots.priceMax || slots.rooms != null);
  if (wants || unavailable) {
    // Sin criterios propios (propiedad que ya no está): se ofrece lo más reciente de la misma inmobiliaria.
    const filter = wants ? { ...buildSearchFilter(slots), agencyId: agency } : { status: "published", agencyId: agency };
    let docs = await load(filter, max);
    if (docs.length === 0 && wants) docs = await load({ ...buildSearchFilter({ ...slots, priceMax: undefined, priceMin: undefined, rooms: undefined, amenities: undefined }), agencyId: agency }, max);
    let fallback = false;
    // Si nada coincide con lo que pidió, se muestra lo más reciente de ESTA inmobiliaria (y se dice que no es lo que pidió).
    if (docs.length === 0 && wants && !unavailable) {
      docs = await load({ status: "published", agencyId: agency }, max);
      fallback = docs.length > 0;
    }
    return { properties: [], unavailable, alternatives: factsOf(docs), search, fallback };
  }
  return { properties: [], unavailable, alternatives: [], search, fallback: false };
}
