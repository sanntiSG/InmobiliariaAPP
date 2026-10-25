/**
 * Datos de una propiedad listos para contarse: función pura (sin base de datos) que comparten los agentes. Hoy la usa el
 * asesor para describir una ficha; el agente de marketing (texto del posteo) y el de correo (respuestas a consultas) usan
 * las mismas piezas, así los tres hablan de la propiedad con las mismas palabras y las mismas cifras.
 */
import { AMENITY_LABELS, OPERATION_LABELS, type Amenity, type Operation } from "@/config/filters";
import { clip, list, money, n0 } from "@/lib/advisor/compose/format";
import { operationText, typeGender, typeLabel } from "@/lib/advisor/compose/vocab";
import type { FactIcon } from "@/lib/advisor/types";

export type PropertyFacts = {
  id: string;
  slug: string;
  title: string;
  description: string;
  type: string;
  operation: string;
  price: { amount: number; currency: string; expenses?: number | null; period?: string | null };
  neighborhood?: string | null;
  city: string;
  rooms?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  garages?: number | null;
  coveredArea?: number | null;
  totalArea?: number | null;
  age?: number | null;
  floor?: number | null;
  orientation?: string | null;
  amenities: string[];
  hasTour: boolean;
  hasAmbient: boolean;
  videoCount: number;
  agencyName?: string | null;
  agencySlug?: string | null;
};

export type FactItem = { icon: FactIcon; label: string; value: string };

const amenityLabel = (a: string): string => (AMENITY_LABELS[a as Amenity] ?? a).toLowerCase();

/** "Palermo, CABA" / "Canning". */
export function placeOf(p: Pick<PropertyFacts, "neighborhood" | "city">): string {
  const hood = p.neighborhood?.trim();
  if (hood && hood.toLowerCase() !== p.city.trim().toLowerCase()) return `${hood}, ${p.city}`;
  return p.city;
}

/** ¿Se paga por mes? Alquiler, o cualquier operación cargada con período mensual (el alquiler temporal suele ser por estadía). */
export const isMonthly = (p: Pick<PropertyFacts, "operation" | "price">): boolean => p.operation === "alquiler" || p.price.period === "mensual";

/** "US$175.000" en venta; "$850.000 por mes" en alquiler. */
export function priceText(p: Pick<PropertyFacts, "operation" | "price">): string {
  const base = money(p.price.amount, p.price.currency);
  return isMonthly(p) ? `${base} por mes` : base;
}

/** Un documento de propiedad tal como sale de la base (con la inmobiliaria poblada o no), con lo que hace falta para contarla. */
export type PropertyDocLike = {
  _id: { toString(): string };
  slug: string;
  title: string;
  description?: string | null;
  type: string;
  operation: string;
  price?: { amount?: number | null; currency?: string | null; expenses?: number | null; period?: string | null } | null;
  address?: { neighborhood?: string | null; city?: string | null } | null;
  features?: {
    rooms?: number | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    garages?: number | null;
    coveredArea?: number | null;
    totalArea?: number | null;
    age?: number | null;
    floor?: number | null;
    orientation?: string | null;
  } | null;
  amenities?: string[] | null;
  media?: { hasTour3d?: boolean | null; hasAmbientCover?: boolean | null; videos?: unknown[] | null } | null;
  agencyId?: unknown;
};

/** Datos de una propiedad listos para contarse, a partir de su documento (la inmobiliaria sólo se toma si viene poblada). */
export function toFacts(doc: PropertyDocLike): PropertyFacts {
  const raw = doc.agencyId;
  const agency = raw && typeof raw === "object" && "name" in raw ? (raw as { name?: string | null; slug?: string | null }) : null;
  return {
    id: String(doc._id),
    slug: doc.slug,
    title: doc.title,
    description: doc.description ?? "",
    type: doc.type,
    operation: doc.operation,
    price: { amount: doc.price?.amount ?? 0, currency: doc.price?.currency ?? "USD", expenses: doc.price?.expenses, period: doc.price?.period },
    neighborhood: doc.address?.neighborhood ?? null,
    city: doc.address?.city ?? "",
    rooms: doc.features?.rooms,
    bedrooms: doc.features?.bedrooms,
    bathrooms: doc.features?.bathrooms,
    garages: doc.features?.garages,
    coveredArea: doc.features?.coveredArea,
    totalArea: doc.features?.totalArea,
    age: doc.features?.age,
    floor: doc.features?.floor,
    orientation: doc.features?.orientation,
    amenities: (doc.amenities ?? []) as string[],
    hasTour: !!doc.media?.hasTour3d,
    hasAmbient: !!doc.media?.hasAmbientCover,
    videoCount: doc.media?.videos?.length ?? 0,
    agencyName: agency?.name ?? null,
    agencySlug: agency?.slug ?? null,
  };
}

/** Superficie que se muestra: la cubierta si hay; si no, la total. */
export function areaOf(p: Pick<PropertyFacts, "coveredArea" | "totalArea">): { value: number; kind: "cubiertos" | "totales" } | null {
  if (p.coveredArea && p.coveredArea > 0) return { value: p.coveredArea, kind: "cubiertos" };
  if (p.totalArea && p.totalArea > 0) return { value: p.totalArea, kind: "totales" };
  return null;
}

/** Filas de la grilla "datos de la propiedad", en el orden en que se leen mejor. */
export function factItems(p: PropertyFacts): FactItem[] {
  const out: FactItem[] = [{ icon: "price", label: "Precio", value: priceText(p) }];
  if (p.price.expenses && p.price.expenses > 0) {
    out.push({ icon: "expenses", label: "Expensas", value: money(p.price.expenses, p.price.currency) });
  }
  out.push({ icon: "place", label: "Zona", value: placeOf(p) });
  if (p.rooms != null) out.push({ icon: "rooms", label: "Ambientes", value: String(p.rooms) });
  if (p.bedrooms != null) out.push({ icon: "bedrooms", label: "Dormitorios", value: String(p.bedrooms) });
  if (p.bathrooms != null) out.push({ icon: "bathrooms", label: "Baños", value: String(p.bathrooms) });
  const area = areaOf(p);
  if (area) out.push({ icon: "area", label: area.kind === "cubiertos" ? "Sup. cubierta" : "Sup. total", value: `${n0(area.value)} m²` });
  if (p.garages && p.garages > 0) out.push({ icon: "garage", label: "Cocheras", value: String(p.garages) });
  if (p.age != null) out.push({ icon: "age", label: "Antigüedad", value: p.age === 0 ? "A estrenar" : `${p.age} ${p.age === 1 ? "año" : "años"}` });
  if (p.floor != null) out.push({ icon: "floor", label: "Piso", value: String(p.floor) });
  if (p.orientation) out.push({ icon: "orientation", label: "Orientación", value: p.orientation });
  const extras = p.amenities.filter((a) => a !== "cochera").slice(0, 4);
  if (extras.length > 0) out.push({ icon: "amenity", label: "Comodidades", value: extras.map((a) => AMENITY_LABELS[a as Amenity] ?? a).join(", ") });
  if (p.hasTour) out.push({ icon: "tour", label: "Recorrido 360°", value: "Se puede recorrer" });
  if (p.hasAmbient) out.push({ icon: "ambient", label: "Portada viva", value: "Día, noche y clima" });
  if (p.videoCount > 0) out.push({ icon: "video", label: "Video", value: p.videoCount === 1 ? "1 video" : `${p.videoCount} videos` });
  return out;
}

/** Lo más llamativo, en frases cortas para armar una oración ("cochera", "pileta", "recorrido 360°"). */
export function highlights(p: PropertyFacts, max = 4): string[] {
  const out: string[] = [];
  if (p.garages && p.garages > 0) out.push(p.garages === 1 ? "cochera" : `${p.garages} cocheras`);
  for (const a of p.amenities) {
    if (a === "cochera") continue;
    out.push(amenityLabel(a));
  }
  if (p.hasTour) out.push("recorrido 360°");
  if (p.hasAmbient) out.push("portada viva");
  return out.slice(0, max);
}

/** Las primeras oraciones de la descripción (hasta juntar ~40 caracteres), sin saltos de línea y con tope de largo. */
export function firstSentences(text: string, max = 150): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const parts = flat.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? [flat];
  let out = "";
  for (const part of parts) {
    const next = out ? `${out} ${part.trim()}` : part.trim();
    if (out && next.length > max) break;
    out = next;
    if (out.length >= 40) break;
  }
  return clip(out, max);
}

/**
 * Una línea que presenta la propiedad: "Es un departamento en alquiler en Palermo, de 3 ambientes y 74 m² cubiertos,
 * a $850.000 por mes (más $120.000 de expensas)."
 */
export function describeLine(p: PropertyFacts): string {
  const article = typeGender(p.type).the === "las" ? "una" : "un";
  const specs: string[] = [];
  if (p.rooms != null) specs.push(`${p.rooms} ${p.rooms === 1 ? "ambiente" : "ambientes"}`);
  const area = areaOf(p);
  if (area) specs.push(`${n0(area.value)} m² ${area.kind}`);
  let head = `Es ${article} ${typeLabel(p.type, false)} ${operationText(p.operation as Operation)} en ${placeOf(p)}`;
  if (specs.length > 0) head += `, de ${list(specs)}`;
  const expenses = p.price.expenses && p.price.expenses > 0 ? ` (más ${money(p.price.expenses, p.price.currency)} de expensas)` : "";
  return `${head}, a ${priceText(p)}${expenses}.`;
}

/** Etiqueta corta de la operación ("Venta", "Alquiler"). */
export const operationName = (op: string): string => OPERATION_LABELS[op as Operation] ?? op;
