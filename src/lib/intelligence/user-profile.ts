import { Types } from "mongoose";
import { Favorite } from "@/lib/db/models/Favorite";
import { Interaction } from "@/lib/db/models/Interaction";
import { Like } from "@/lib/db/models/Like";
import { Property } from "@/lib/db/models/Property";
import { Rating } from "@/lib/db/models/Rating";
import { UserTasteProfile } from "@/lib/db/models/UserTasteProfile";

const DAY_MS = 86_400_000;
/** Vida media: una señal pierde la mitad de su peso cada 30 días. */
const HALF_LIFE_DAYS = 30;
const LOOKBACK_DAYS = 120;
/** El perfil se recalcula si tiene más de esto, o si hay actividad nueva desde que se calculó. */
const PROFILE_TTL_MS = 6 * 60 * 60 * 1000;

/** Cuánto pesa cada tipo de señal. Cuanto más intención de compra, más peso. */
export const SIGNAL_WEIGHT = {
  view: 1,
  dwell: 1.5, // se quedó más de un minuto leyendo la ficha
  tour_open: 1.5,
  comment: 1.5,
  like: 2,
  share: 2.5,
  save: 3,
  contact: 3,
  inquiry: 4,
} as const;

/** Un puntaje de 1 a 5 pesa (valor − 3) × RATING_FACTOR: un 5 suma, un 1 resta. */
const RATING_FACTOR = 1.5;

export type Weighted = { key: string; weight: number };

export type TasteProfileData = {
  sampleSize: number;
  totalWeight: number;
  neighborhoods: Weighted[];
  types: Weighted[];
  operations: Weighted[];
  amenities: Weighted[];
  prices: { key: string; median: number; low: number; high: number }[];
  bedrooms: number | null;
  area: number | null;
  centroids: { lat: number; lng: number; weight: number }[];
  /** Cantidad de propiedades guardadas (para decidir el texto "similar a las que guardaste"). */
  savedCount: number;
};

export type ProfileProperty = {
  id: string;
  type: string;
  operation: string;
  neighborhood?: string | null;
  currency: string;
  price: number;
  bedrooms?: number | null;
  area?: number | null;
  amenities: string[];
  lng: number;
  lat: number;
};

export const priceKey = (operation: string, currency: string) => `${operation}:${currency}`;

/** Peso de una señal que ocurrió hace `ageMs`: decae exponencialmente con la vida media. */
export function decay(ageMs: number): number {
  return Math.pow(0.5, Math.max(0, ageMs) / (HALF_LIFE_DAYS * DAY_MS));
}

function weightedQuantile(items: { v: number; w: number }[], q: number): number {
  const sorted = [...items].sort((a, b) => a.v - b.v);
  const total = sorted.reduce((s, i) => s + i.w, 0);
  let acc = 0;
  for (const item of sorted) {
    acc += item.w;
    if (acc >= total * q) return item.v;
  }
  return sorted[sorted.length - 1]!.v;
}

function topWeighted(map: Map<string, number>, limit: number): Weighted[] {
  const total = [...map.values()].reduce((s, w) => s + w, 0);
  if (total <= 0) return [];
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, w]) => ({ key, weight: w / total }));
}

/**
 * Perfil a partir de pesos ya calculados por propiedad (señal × decaimiento) y
 * de los datos de esas propiedades. Función pura: los pesos son la parte
 * "comportamiento"; acá solo se agrupan en zonas, tipos, rango de precio, etc.
 */
export function buildProfileData(
  weights: Map<string, number>,
  properties: ProfileProperty[],
  savedCount: number
): TasteProfileData {
  const neighborhoods = new Map<string, number>();
  const types = new Map<string, number>();
  const operations = new Map<string, number>();
  const amenities = new Map<string, number>();
  const priceSamples = new Map<string, { v: number; w: number }[]>();
  const bedrooms: { v: number; w: number }[] = [];
  const areas: { v: number; w: number }[] = [];
  const cells = new Map<string, { w: number; lat: number; lng: number }>();

  let sampleSize = 0;
  let totalWeight = 0;

  for (const p of properties) {
    const w = weights.get(p.id) ?? 0;
    if (w <= 0) continue;
    sampleSize += 1;
    totalWeight += w;

    if (p.neighborhood) neighborhoods.set(p.neighborhood, (neighborhoods.get(p.neighborhood) ?? 0) + w);
    types.set(p.type, (types.get(p.type) ?? 0) + w);
    operations.set(p.operation, (operations.get(p.operation) ?? 0) + w);
    for (const a of p.amenities) amenities.set(a, (amenities.get(a) ?? 0) + w);

    const key = priceKey(p.operation, p.currency);
    priceSamples.set(key, [...(priceSamples.get(key) ?? []), { v: p.price, w }]);
    if (p.bedrooms != null) bedrooms.push({ v: p.bedrooms, w });
    if (p.area != null) areas.push({ v: p.area, w });

    // Celdas de ~6 km: agrupan las zonas geográficas de interés.
    const cell = `${Math.round(p.lat / 0.06)}:${Math.round(p.lng / 0.06)}`;
    const c = cells.get(cell) ?? { w: 0, lat: 0, lng: 0 };
    c.w += w;
    c.lat += p.lat * w;
    c.lng += p.lng * w;
    cells.set(cell, c);
  }

  return {
    sampleSize,
    totalWeight,
    neighborhoods: topWeighted(neighborhoods, 8),
    types: topWeighted(types, 5),
    operations: topWeighted(operations, 3),
    amenities: topWeighted(amenities, 8),
    prices: [...priceSamples.entries()].map(([key, items]) => ({
      key,
      median: weightedQuantile(items, 0.5),
      low: weightedQuantile(items, 0.25),
      high: weightedQuantile(items, 0.75),
    })),
    bedrooms: bedrooms.length ? weightedQuantile(bedrooms, 0.5) : null,
    area: areas.length ? weightedQuantile(areas, 0.5) : null,
    centroids: [...cells.values()]
      .sort((a, b) => b.w - a.w)
      .slice(0, 3)
      .map((c) => ({ lat: c.lat / c.w, lng: c.lng / c.w, weight: c.w })),
    savedCount,
  };
}

/** Pesos por propiedad a partir de toda la actividad real del usuario (con decaimiento temporal). */
async function collectWeights(userId: string, now: number) {
  const since = new Date(now - LOOKBACK_DAYS * DAY_MS);
  const uid = new Types.ObjectId(userId);

  const [interactions, favorites, likes, ratings] = await Promise.all([
    Interaction.find({
      userId: uid,
      createdAt: { $gte: since },
      type: { $in: ["view", "dwell", "tour_open", "comment", "share", "contact", "inquiry"] },
    })
      .select("propertyId type createdAt")
      .sort({ createdAt: -1 })
      .limit(1500)
      .lean(),
    // Guardados y likes salen de sus colecciones (estado actual real): el log de
    // Interaction también guarda los "unsave"/"unlike", que no son interés.
    Favorite.find({ userId: uid }).select("propertyId createdAt").limit(500).lean(),
    Like.find({ userId: uid }).select("propertyId createdAt").limit(500).lean(),
    Rating.find({ userId: uid }).select("propertyId value updatedAt").limit(500).lean(),
  ]);

  const weights = new Map<string, number>();
  const add = (propertyId: unknown, signal: number, at: Date | undefined) => {
    const id = String(propertyId);
    const age = at ? now - new Date(at).getTime() : 0;
    weights.set(id, (weights.get(id) ?? 0) + signal * decay(age));
  };

  for (const i of interactions) add(i.propertyId, SIGNAL_WEIGHT[i.type as keyof typeof SIGNAL_WEIGHT] ?? 1, i.createdAt);
  for (const f of favorites) add(f.propertyId, SIGNAL_WEIGHT.save, f.createdAt);
  for (const l of likes) add(l.propertyId, SIGNAL_WEIGHT.like, l.createdAt);
  for (const r of ratings) add(r.propertyId, (r.value - 3) * RATING_FACTOR, (r as { updatedAt?: Date }).updatedAt);

  return { weights, savedCount: favorites.length };
}

/** Calcula el perfil desde cero y lo guarda. */
export async function rebuildTasteProfile(userId: string, now = Date.now()): Promise<TasteProfileData> {
  const { weights, savedCount } = await collectWeights(userId, now);
  const ids = [...weights.entries()].filter(([, w]) => w > 0).map(([id]) => id);

  const docs = ids.length
    ? await Property.find({ _id: { $in: ids } })
        .select(
          "type operation address.neighborhood price features.bedrooms features.totalArea features.coveredArea amenities location"
        )
        .lean()
    : [];

  const properties: ProfileProperty[] = docs.map((d) => ({
    id: String(d._id),
    type: d.type,
    operation: d.operation,
    neighborhood: d.address?.neighborhood ?? null,
    currency: d.price?.currency ?? "USD",
    price: d.price?.amount ?? 0,
    bedrooms: d.features?.bedrooms ?? null,
    area: d.features?.totalArea ?? d.features?.coveredArea ?? null,
    amenities: (d.amenities ?? []) as string[],
    lng: d.location.coordinates[0]!,
    lat: d.location.coordinates[1]!,
  }));

  const data = buildProfileData(weights, properties, savedCount);

  await UserTasteProfile.findOneAndUpdate(
    { userId },
    {
      $set: {
        ...data,
        computedAt: new Date(now),
        topNeighborhoods: data.neighborhoods.slice(0, 3).map((n) => n.key),
        topTypes: data.types.slice(0, 2).map((t) => t.key),
        topOperations: data.operations.slice(0, 2).map((o) => o.key),
      },
    },
    { upsert: true }
  );
  return data;
}

/**
 * Perfil de gustos del usuario: el guardado si es reciente y no hubo actividad
 * nueva desde que se calculó; si no, se recalcula. Mejora solo a medida que
 * el usuario interactúa.
 */
export async function getTasteProfile(userId: string, now = Date.now()): Promise<TasteProfileData> {
  const saved = await UserTasteProfile.findOne({ userId }).lean();
  if (saved && now - saved.computedAt.getTime() < PROFILE_TTL_MS) {
    const latest = await Interaction.findOne({ userId }).sort({ createdAt: -1 }).select("createdAt").lean();
    if (!latest || latest.createdAt <= saved.computedAt) {
      return {
        sampleSize: saved.sampleSize,
        totalWeight: saved.totalWeight,
        neighborhoods: saved.neighborhoods as Weighted[],
        types: saved.types as Weighted[],
        operations: saved.operations as Weighted[],
        amenities: saved.amenities as Weighted[],
        prices: saved.prices as TasteProfileData["prices"],
        bedrooms: saved.bedrooms ?? null,
        area: saved.area ?? null,
        centroids: saved.centroids as TasteProfileData["centroids"],
        savedCount: saved.savedCount ?? 0,
      };
    }
  }
  return rebuildTasteProfile(userId, now);
}
