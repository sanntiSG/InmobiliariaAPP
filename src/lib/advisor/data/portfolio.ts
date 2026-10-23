import { Types } from "mongoose";
import { Agency } from "@/lib/db/models/Agency";
import { Property } from "@/lib/db/models/Property";
import { memo } from "@/lib/intelligence/cache";
import { getBenchmarks, type Benchmarks } from "@/lib/intelligence/benchmarks";
import type { Diagnostic } from "@/lib/intelligence/diagnostics";
import { emptyTotals, type Totals } from "@/lib/intelligence/metrics";
import { getIntelligence, type Intelligence } from "@/lib/intelligence/opportunities";
import { loadActivity, type ActivityEntry } from "./activity";

const PORTFOLIO_TTL_MS = 30_000;
const MAX_ROWS = 600;

/**
 * Una propiedad con todo lo que el asesor necesita para razonar sobre ella:
 * datos de la ficha + métricas (las mismas del panel) + diagnósticos ya
 * calculados. Se arma UNA vez por consulta; los handlers sólo la recorren.
 */
export type PropertyRow = {
  id: string;
  slug: string;
  title: string;
  status: "published" | "draft";
  agencyId: string;
  agencyName: string | null;
  type: string;
  operation: string;
  price: number;
  currency: string;
  period: string;
  neighborhood: string | null;
  city: string;
  bedrooms: number | null;
  rooms: number | null;
  /** Superficie de referencia (cubierta si existe, si no total). */
  area: number | null;
  amenities: string[];
  images: number;
  descriptionLength: number;
  videos: number;
  hasTour: boolean;
  /** Tiene portada viva (la foto de portada que cambia de día a noche, con lluvia y viento). */
  hasAmbientCover: boolean;
  scenes: number;
  cover: string | null;
  publishedAt: Date | null;
  priceChangedAt: Date | null;
  /** Precio por m² (sólo si hay superficie y precio). */
  pricePerM2: number | null;
  w7: Totals;
  p7: Totals;
  d30: Totals;
  /** Puntaje de interés (`interestScore`), el mismo del panel. */
  score: number;
  diagnostics: Diagnostic[];
  /** Hallazgos de este tipo → para detectar problemas sin recalcular reglas. */
  place: string;
};

export type Portfolio = {
  scope: { agencyId: string | null };
  /** Publicadas: las que tienen métricas y entran a rankings. */
  rows: PropertyRow[];
  /** Borradores (sólo se usan para "publicaciones incompletas"). */
  drafts: PropertyRow[];
  byId: Map<string, PropertyRow>;
  intel: Intelligence;
  bench: Benchmarks;
  activity: ActivityEntry[];
  loadedAt: number;
};

/**
 * Portfolio del alcance (`agencyId` o toda la plataforma con `null`). Cacheado
 * 30 s y descartado apenas la inmobiliaria cambia algo (ver `touchAgencyData`),
 * así el asesor nunca responde con datos de antes de la última edición.
 */
export function loadPortfolio(agencyId: string | null): Promise<Portfolio> {
  return memo(`advisor:${agencyId ?? "all"}:portfolio`, PORTFOLIO_TTL_MS, () => build(agencyId));
}

async function build(agencyId: string | null): Promise<Portfolio> {
  const agencyFilter = agencyId ? { agencyId: new Types.ObjectId(agencyId) } : {};
  const [docs, intel, bench, activity] = await Promise.all([
    Property.find({ status: { $in: ["published", "draft"] }, ...agencyFilter })
      .select(
        "agencyId slug title status type operation price priceHistory address features amenities media.images media.videos media.hasTour3d media.hasAmbientCover media.ambient.poster.url media.tours description publishedAt"
      )
      .sort({ updatedAt: -1 })
      .limit(MAX_ROWS)
      .lean(),
    getIntelligence(agencyId),
    getBenchmarks(),
    loadActivity(agencyId),
  ]);

  const insights = new Map(intel.properties.map((p) => [p.id, p]));

  // En el alcance "toda la plataforma" las filas necesitan el nombre de su inmobiliaria.
  const names = new Map<string, string>();
  if (!agencyId) {
    const ids = [...new Set(docs.map((d) => String(d.agencyId)))];
    for (const a of await Agency.find({ _id: { $in: ids } }).select("name").lean()) names.set(String(a._id), a.name);
  }

  const rows: PropertyRow[] = [];
  const drafts: PropertyRow[] = [];

  for (const doc of docs) {
    const id = String(doc._id);
    const insight = insights.get(id);
    const history = doc.priceHistory ?? [];
    const lastChange = history.length > 1 ? history[history.length - 1]!.changedAt : null;
    const cover = doc.media?.images?.length
      ? [...doc.media.images].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0]
      : undefined;
    const area = doc.features?.coveredArea ?? doc.features?.totalArea ?? null;
    const amount = doc.price?.amount ?? 0;
    const neighborhood = doc.address?.neighborhood ?? null;
    const city = doc.address?.city ?? "";

    const row: PropertyRow = {
      id,
      slug: doc.slug,
      title: doc.title,
      status: doc.status === "published" ? "published" : "draft",
      agencyId: String(doc.agencyId),
      agencyName: names.get(String(doc.agencyId)) ?? null,
      type: doc.type,
      operation: doc.operation,
      price: amount,
      currency: doc.price?.currency ?? "USD",
      period: doc.price?.period ?? "total",
      neighborhood,
      city,
      bedrooms: doc.features?.bedrooms ?? null,
      rooms: doc.features?.rooms ?? null,
      area,
      amenities: (doc.amenities ?? []) as string[],
      images: doc.media?.images?.length ?? 0,
      descriptionLength: (doc.description ?? "").trim().length,
      videos: doc.media?.videos?.length ?? 0,
      hasTour: !!doc.media?.hasTour3d,
      hasAmbientCover: !!doc.media?.hasAmbientCover,
      scenes: doc.media?.tours?.length ?? 0,
      // Con portada viva, su imagen de portada es el póster.
      cover: (doc.media?.hasAmbientCover && doc.media.ambient?.poster?.url) || cover?.url || null,
      publishedAt: doc.publishedAt ? new Date(doc.publishedAt) : null,
      priceChangedAt: lastChange ? new Date(lastChange) : null,
      pricePerM2: area && amount > 0 ? amount / area : null,
      w7: insight?.w7 ?? emptyTotals(),
      p7: insight?.p7 ?? emptyTotals(),
      d30: insight?.d30 ?? emptyTotals(),
      score: insight?.score ?? 0,
      diagnostics: insight?.diagnostics ?? [],
      place: neighborhood ?? city,
    };
    (row.status === "published" ? rows : drafts).push(row);
  }

  return {
    scope: { agencyId },
    rows,
    drafts,
    byId: new Map([...rows, ...drafts].map((r) => [r.id, r])),
    intel,
    bench,
    activity,
    loadedAt: Date.now(),
  };
}
