/**
 * Datos del mercado PÚBLICO para el modo explorador: sólo propiedades
 * publicadas y campos que ya se muestran en la plataforma. Nunca toca métricas
 * privadas de una inmobiliaria.
 */
import { Types } from "mongoose";
import type { PropertyCardData } from "@/components/property/types";
import type { Currency, Operation } from "@/config/filters";
import { Agency } from "@/lib/db/models/Agency";
import { Property } from "@/lib/db/models/Property";
import { toPropertyCardData } from "@/lib/db/property-card-mapper";
import { PROPERTY_CARD_PROJECTION } from "@/lib/db/property-query";
import { memo } from "@/lib/intelligence/cache";
import { interestScore, dominantInteraction } from "@/lib/intelligence/diagnostics";
import { getPropertyMetrics } from "@/lib/intelligence/metrics";
import { buildEntityIndex, type EntityIndex } from "../nlu/entities";
import type { Money, Slots } from "../types";

const DAY_MS = 86_400_000;

/**
 * Índice de zonas del mercado público, para que el explorador pueda nombrar un
 * barrio o ciudad y el asesor lo reconozca. No incluye títulos: el explorador
 * se refiere a propiedades por lo conversado ("la primera", "esa").
 */
export function loadMarketIndex(): Promise<EntityIndex> {
  return memo("advisor:market-index", 10 * 60_000, async () => {
    const [neighborhoods, cities] = await Promise.all([
      Property.distinct("address.neighborhood", { status: "published" }),
      Property.distinct("address.city", { status: "published" }),
    ]);
    const zones = [...neighborhoods, ...cities].filter((z): z is string => typeof z === "string" && z.trim().length > 1);
    return buildEntityIndex({ zones, properties: [] });
  });
}

// ─── Filtros ─────────────────────────────────────────────────────────────────

/** Moneda de un monto sin moneda explícita: ventas en dólares, alquileres en pesos. */
export function resolveCurrency(m: Money, operation?: Operation): Currency {
  if (m.currency) return m.currency;
  if (operation === "alquiler" || operation === "alquiler_temporal") return "ARS";
  if (operation === "venta") return "USD";
  return m.amount >= 1_000_000 ? "ARS" : "USD";
}

export type SearchRelax = { exactRooms?: boolean; dropAmenities?: boolean; widenPrice?: boolean };

/** Filtro Mongo de una búsqueda del explorador: siempre sólo publicadas. */
export function buildSearchFilter(slots: Slots, relax: SearchRelax = {}): Record<string, unknown> {
  const f: Record<string, unknown> = { status: "published" };
  if (slots.operation) f.operation = slots.operation;
  if (slots.types?.length) f.type = { $in: slots.types };
  if (slots.zones?.length) {
    f.$or = [{ "address.neighborhood": { $in: slots.zones } }, { "address.city": { $in: slots.zones } }];
  }
  if (slots.rooms != null) f["features.rooms"] = relax.exactRooms ? { $gte: slots.rooms } : slots.rooms;
  if (slots.bedrooms != null) f["features.bedrooms"] = { $gte: slots.bedrooms };
  if (slots.amenities?.length && !relax.dropAmenities) f.amenities = { $all: slots.amenities };
  if (slots.withTour) f["media.hasTour3d"] = true;
  if (slots.withAmbient) f["media.hasAmbientCover"] = true;

  if (slots.priceMax || slots.priceMin) {
    const ref = slots.priceMax ?? slots.priceMin!;
    f["price.currency"] = resolveCurrency(ref, slots.operation);
    const range: Record<string, number> = {};
    if (slots.priceMin) range.$gte = slots.priceMin.amount;
    if (slots.priceMax) range.$lte = Math.round(slots.priceMax.amount * (relax.widenPrice ? 1.2 : 1));
    f["price.amount"] = range;
  }
  return f;
}

export type SearchResult = { items: PropertyCardData[]; total: number; relaxed: string[] };

const lean = (filter: Record<string, unknown>, limit: number, sort: Record<string, 1 | -1> = { publishedAt: -1 }) =>
  Property.find(filter)
    .select(PROPERTY_CARD_PROJECTION)
    .populate({ path: "agencyId", select: "name slug logo" })
    .sort(sort)
    .limit(limit)
    .lean();

/** Busca propiedades; si no hay nada, afloja de a un criterio (ambientes exactos → comodidades → +20 % de precio) y lo informa. */
export async function searchCards(slots: Slots, limit = 6): Promise<SearchResult> {
  const steps: { relax: SearchRelax; label: string; applies: boolean }[] = [
    { relax: {}, label: "", applies: true },
    { relax: { exactRooms: true }, label: "de ese tamaño o más grandes", applies: slots.rooms != null },
    { relax: { exactRooms: true, dropAmenities: true }, label: "sin exigir todas las comodidades", applies: !!slots.amenities?.length },
    { relax: { exactRooms: true, dropAmenities: true, widenPrice: true }, label: "con hasta un 20 % más de presupuesto", applies: !!(slots.priceMax) },
  ];
  const relaxed: string[] = [];
  const now = Date.now();
  for (const step of steps) {
    if (!step.applies) continue;
    const filter = buildSearchFilter(slots, step.relax);
    const [docs, total] = await Promise.all([lean(filter, limit), Property.countDocuments(filter)]);
    if (step.label) relaxed.push(step.label);
    if (total > 0 || step === steps[steps.length - 1]) {
      return { items: docs.map((d) => toPropertyCardData(d, now)), total, relaxed: total > 0 ? relaxed : [] };
    }
  }
  return { items: [], total: 0, relaxed: [] };
}

/** Enlaces al listado y al mapa con los mismos filtros (el listado busca la zona por texto). */
export function searchLinks(slots: Slots): { list: string; map: string } {
  const p = new URLSearchParams();
  if (slots.operation) p.set("operation", slots.operation);
  if (slots.types?.length) p.set("type", slots.types.join(","));
  if (slots.priceMax) p.set("priceMax", String(slots.priceMax.amount));
  if (slots.priceMin) p.set("priceMin", String(slots.priceMin.amount));
  if (slots.rooms != null) p.set("minRooms", String(slots.rooms));
  if (slots.withTour) p.set("tour3d", "true");
  if (slots.zones?.[0]) p.set("q", slots.zones[0]);
  const qs = p.toString();
  return { list: `/propiedades${qs ? `?${qs}` : ""}`, map: `/mapa${qs ? `?${qs}` : ""}` };
}

/** Tarjetas de ids concretos (sólo publicadas), en el orden pedido. */
export async function loadCardsByIds(ids: string[]): Promise<PropertyCardData[]> {
  const valid = ids.filter((id) => Types.ObjectId.isValid(id)).slice(0, 10);
  if (valid.length === 0) return [];
  const docs = await lean({ _id: { $in: valid.map((i) => new Types.ObjectId(i)) }, status: "published" }, 10);
  const now = Date.now();
  const byId = new Map(docs.map((d) => [String(d._id), toPropertyCardData(d, now)]));
  return valid.map((id) => byId.get(id)).filter((c): c is PropertyCardData => !!c);
}

// ─── Precios del mercado ─────────────────────────────────────────────────────

function percentile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export type PriceStats = {
  n: number;
  currency: Currency;
  median: number | null;
  p25: number | null;
  p75: number | null;
  /** Propiedades con superficie conocida (base del precio por m²). */
  ppmN: number;
  ppmMedian: number | null;
  ppmP25: number | null;
  ppmP75: number | null;
  /** Cuántas hay en la otra moneda (no se mezclan). */
  otherCurrency: number;
};

/** Precio típico del mercado público para un filtro, sin mezclar monedas. */
export async function priceStats(slots: Slots, excludeId?: string): Promise<PriceStats> {
  const filter = buildSearchFilter({ ...slots, priceMax: undefined, priceMin: undefined, amenities: undefined, withTour: undefined, withAmbient: undefined });
  if (excludeId && Types.ObjectId.isValid(excludeId)) filter._id = { $ne: new Types.ObjectId(excludeId) };
  const docs = await Property.find(filter).select("price.amount price.currency features.coveredArea features.totalArea").limit(800).lean();

  const by: Record<string, { price: number[]; ppm: number[] }> = { USD: { price: [], ppm: [] }, ARS: { price: [], ppm: [] } };
  for (const d of docs) {
    const cur = d.price?.currency === "ARS" ? "ARS" : "USD";
    const amount = d.price?.amount ?? 0;
    if (amount <= 0) continue;
    by[cur]!.price.push(amount);
    const area = d.features?.coveredArea ?? d.features?.totalArea;
    if (area && area > 0) by[cur]!.ppm.push(amount / area);
  }

  const preferred: Currency = slots.operation === "venta" ? "USD" : slots.operation ? "ARS" : by.USD!.price.length >= by.ARS!.price.length ? "USD" : "ARS";
  const currency = by[preferred]!.price.length > 0 ? preferred : preferred === "USD" ? "ARS" : "USD";
  const price = [...by[currency]!.price].sort((a, b) => a - b);
  const ppm = [...by[currency]!.ppm].sort((a, b) => a - b);
  return {
    n: price.length,
    currency,
    median: percentile(price, 0.5),
    p25: percentile(price, 0.25),
    p75: percentile(price, 0.75),
    ppmN: ppm.length,
    ppmMedian: percentile(ppm, 0.5),
    ppmP25: percentile(ppm, 0.25),
    ppmP75: percentile(ppm, 0.75),
    otherCurrency: by[currency === "USD" ? "ARS" : "USD"]!.price.length,
  };
}

// ─── Bajas de precio, novedades, tendencias ──────────────────────────────────

export type PriceDrop = { card: PropertyCardData; from: number; to: number; pct: number; at: Date };

/** Propiedades publicadas cuyo último cambio de precio fue una baja (misma moneda) en los últimos 30 días. */
export async function recentPriceDrops(slots: Slots, limit = 6, days = 30): Promise<PriceDrop[]> {
  const filter = buildSearchFilter({ ...slots, priceMax: undefined, priceMin: undefined, amenities: undefined });
  filter["priceHistory.1"] = { $exists: true };
  const since = new Date(Date.now() - days * DAY_MS);
  const docs = await Property.find(filter)
    .select(`${PROPERTY_CARD_PROJECTION} priceHistory`)
    .populate({ path: "agencyId", select: "name slug logo" })
    .sort({ updatedAt: -1 })
    .limit(300)
    .lean();

  const now = Date.now();
  const drops: PriceDrop[] = [];
  for (const d of docs) {
    const h = d.priceHistory ?? [];
    const last = h[h.length - 1];
    const prev = h[h.length - 2];
    if (!last || !prev || last.currency !== prev.currency || last.amount >= prev.amount) continue;
    if (new Date(last.changedAt) < since) continue;
    drops.push({
      card: toPropertyCardData(d, now),
      from: prev.amount,
      to: last.amount,
      pct: ((prev.amount - last.amount) / prev.amount) * 100,
      at: new Date(last.changedAt),
    });
  }
  return drops.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

export async function newestCards(slots: Slots, days: number, limit = 6): Promise<SearchResult> {
  const filter = { ...buildSearchFilter(slots), publishedAt: { $gte: new Date(Date.now() - days * DAY_MS) } };
  const [docs, total] = await Promise.all([lean(filter, limit), Property.countDocuments(filter)]);
  const now = Date.now();
  return { items: docs.map((d) => toPropertyCardData(d, now)), total, relaxed: [] };
}

export type Trending = { id: string; score: number; dominant: string | null };

/** Lo que más interés generó esta semana en toda la plataforma (cacheado 5 minutos). */
export function loadTrending(): Promise<Trending[]> {
  return memo("advisor:trending", 5 * 60_000, async () => {
    const metrics = await getPropertyMetrics({});
    return [...metrics.values()]
      .map((m) => ({ id: m.propertyId, score: interestScore(m.w7), dominant: dominantInteraction(m.w7) as string | null }))
      .filter((t) => t.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 80);
  });
}

/** Tarjetas de lo más popular (respetando filtros), con el motivo de por qué aparece. */
export async function popularCards(slots: Slots, limit = 6): Promise<{ items: PropertyCardData[]; total: number }> {
  const trending = await loadTrending();
  if (trending.length === 0) return { items: [], total: 0 };
  const filter = { ...buildSearchFilter(slots), _id: { $in: trending.map((t) => new Types.ObjectId(t.id)) } };
  const docs = await lean(filter, 80);
  const rank = new Map(trending.map((t, i) => [t.id, { i, t }]));
  const now = Date.now();
  const ordered = docs
    .map((d) => ({ d, r: rank.get(String(d._id))! }))
    .filter((x) => !!x.r)
    .sort((a, b) => a.r.i - b.r.i)
    .slice(0, limit)
    .map(({ d, r }) => ({
      ...toPropertyCardData(d, now),
      reason: r.t.dominant ? `Es de las que más ${r.t.dominant === "consultas" ? "consultas reciben" : r.t.dominant === "guardados" ? "se guardan" : r.t.dominant === "me gusta" ? "me gusta reciben" : "se ven"} esta semana.` : "Es de las que más interés generan esta semana.",
    }));
  return { items: ordered, total: ordered.length };
}

/** Cuántas propiedades nuevas y bajas de precio hubo últimamente (para el saludo del explorador). */
export function loadMarketPulse(): Promise<{ newThisWeek: number; drops: number; published: number }> {
  return memo("advisor:market-pulse", 5 * 60_000, async () => {
    const [newThisWeek, published, drops] = await Promise.all([
      Property.countDocuments({ status: "published", publishedAt: { $gte: new Date(Date.now() - 7 * DAY_MS) } }),
      Property.countDocuments({ status: "published" }),
      recentPriceDrops({}, 50, 14),
    ]);
    return { newThisWeek, published, drops: drops.length };
  });
}

// ─── Inmobiliarias por zona ──────────────────────────────────────────────────

export type AgencyCount = { name: string; slug: string; count: number };

export async function agenciesByZone(slots: Slots, limit = 6): Promise<AgencyCount[]> {
  const filter = buildSearchFilter({ ...slots, priceMax: undefined, priceMin: undefined, amenities: undefined });
  const rows = await Property.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: filter },
    { $group: { _id: "$agencyId", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);
  const agencies = await Agency.find({ _id: { $in: rows.map((r) => r._id) }, status: "active" }).select("name slug").lean();
  const byId = new Map(agencies.map((a) => [String(a._id), a]));
  return rows
    .map((r) => ({ a: byId.get(String(r._id)), count: r.count }))
    .filter((x): x is { a: NonNullable<typeof x.a>; count: number } => !!x.a)
    .map(({ a, count }) => ({ name: a.name, slug: a.slug, count }));
}

/** Zonas con más oferta (para sugerir cuando una búsqueda no encuentra nada). */
export function topZones(limit = 5): Promise<{ zone: string; count: number }[]> {
  return memo(`advisor:top-zones:${limit}`, 10 * 60_000, async () => {
    const rows = await Property.aggregate<{ _id: string; count: number }>([
      { $match: { status: "published", "address.neighborhood": { $nin: [null, ""] } } },
      { $group: { _id: "$address.neighborhood", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]);
    return rows.map((r) => ({ zone: r._id, count: r.count }));
  });
}
