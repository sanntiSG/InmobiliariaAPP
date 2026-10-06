import { Types } from "mongoose";
import { Property } from "@/lib/db/models/Property";
import { User } from "@/lib/db/models/User";
import { Favorite } from "@/lib/db/models/Favorite";
import { Like } from "@/lib/db/models/Like";
import { Lead } from "@/lib/db/models/Lead";
import { toPropertyCardData } from "@/lib/db/property-card-mapper";
import { PROPERTY_CARD_PROJECTION } from "@/lib/db/property-query";
import { distanceMeters } from "@/lib/map/geo";
import { memo } from "@/lib/intelligence/cache";
import { getPropertyMetrics } from "@/lib/intelligence/metrics";
import { getTasteProfile, priceKey, type TasteProfileData } from "@/lib/intelligence/user-profile";
import type { PropertyCardData } from "@/components/property/types";

export type ReasonCode = "loc_price" | "similar" | "near_zone" | "co_saved" | "trending" | "fits";

export type Recommendation = {
  card: PropertyCardData;
  score: number;
  reasons: ReasonCode[];
  /** Texto principal para mostrarle al usuario. */
  reason: string;
};

export type Preferences = {
  operations?: string[] | null;
  propertyTypes?: string[] | null;
  locations?: string[] | null;
  priceMin?: number | null;
  priceMax?: number | null;
  minRooms?: number | null;
};

/** Datos de una propiedad candidata necesarios para puntuarla. */
export type Candidate = {
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
  tour3d: boolean;
  isNew: boolean;
  ratingAvg: number;
  ratingCount: number;
  views: number;
};

export type ScoreContext = {
  prefs: Preferences;
  profile: TasteProfileData;
  /** Cuántas personas con gustos parecidos guardaron/likearon cada propiedad. */
  coSaved: Map<string, number>;
};

export const REASON_TEXT: Record<ReasonCode, (ctx: { saved: boolean }) => string> = {
  loc_price: () => "Esta propiedad coincide con tus preferencias de ubicación y precio.",
  similar: ({ saved }) =>
    saved
      ? "Encontramos una propiedad similar a las que guardaste."
      : "Encontramos una propiedad similar a las que viste.",
  near_zone: () => "Esta propiedad está cerca de una zona que te interesa.",
  co_saved: () => "A personas con intereses parecidos a los tuyos también les interesó.",
  trending: () => "Está teniendo mucho interés esta semana.",
  fits: () => "Esta propiedad podría encajar con tus preferencias.",
};

const REASON_PRIORITY: ReasonCode[] = ["loc_price", "similar", "near_zone", "co_saved", "trending", "fits"];

const share = (list: { key: string; weight: number }[], key: string | null | undefined) =>
  key ? (list.find((w) => w.key === key)?.weight ?? 0) : 0;

function nearestCentroidKm(profile: TasteProfileData, c: Candidate): number | null {
  if (profile.centroids.length === 0) return null;
  return Math.min(...profile.centroids.map((k) => distanceMeters([c.lng, c.lat], [k.lng, k.lat]) / 1000));
}

/**
 * Puntaje de una propiedad para un usuario: preferencias explícitas + parecido
 * con lo que hace (perfil con decaimiento) + lo que les interesó a personas
 * parecidas + calidad de la publicación. Función pura, sin base de datos.
 */
export function scoreCandidate(c: Candidate, ctx: ScoreContext): { score: number; reasons: ReasonCode[] } {
  const { prefs, profile, coSaved } = ctx;
  let score = 0;

  // — Preferencias explícitas —
  const hasPriceRange = prefs.priceMin != null || prefs.priceMax != null;
  const prefPrice =
    hasPriceRange && (prefs.priceMin == null || c.price >= prefs.priceMin) && (prefs.priceMax == null || c.price <= prefs.priceMax);
  const prefLocation = !!c.neighborhood && !!prefs.locations?.some((l) => c.neighborhood!.toLowerCase().includes(l.toLowerCase()));
  if (prefs.operations?.includes(c.operation)) score += 12;
  if (prefs.propertyTypes?.includes(c.type)) score += 12;
  if (prefPrice) score += 14;
  if (prefLocation) score += 14;
  if (prefs.minRooms && c.bedrooms != null && c.bedrooms >= prefs.minRooms) score += 4;

  // — Parecido con la actividad real —
  const hoodShare = share(profile.neighborhoods, c.neighborhood);
  const typeShare = share(profile.types, c.type);
  score += hoodShare * 16 + typeShare * 10 + share(profile.operations, c.operation) * 5;

  const band = profile.prices.find((p) => p.key === priceKey(c.operation, c.currency));
  let priceFit = false;
  // "Parecido" tolera más variación de precio que "dentro de tu rango habitual".
  const priceNear = !band || (c.price >= band.median * 0.5 && c.price <= band.median * 2);
  if (band) {
    if (c.price >= band.low * 0.9 && c.price <= band.high * 1.1) {
      score += 12;
      priceFit = true;
    } else if (c.price >= band.median * 0.6 && c.price <= band.median * 1.5) {
      score += 6;
    }
  }

  const km = nearestCentroidKm(profile, c);
  if (km != null) {
    if (km <= 3) score += 12;
    else if (km <= 8) score += 8;
    else if (km <= 15) score += 4;
  }

  const amenityShare = Math.min(1, c.amenities.reduce((sum, a) => sum + share(profile.amenities, a), 0));
  score += amenityShare * 6;
  if (profile.bedrooms != null && c.bedrooms != null) {
    const diff = Math.abs(c.bedrooms - profile.bedrooms);
    score += diff === 0 ? 4 : diff <= 1 ? 2 : 0;
  }
  if (profile.area != null && c.area != null && Math.abs(c.area - profile.area) / profile.area <= 0.25) score += 3;

  // — Personas parecidas —
  const co = coSaved.get(c.id) ?? 0;
  score += Math.min(co, 5) * 2.4;

  // — Calidad y frescura —
  if (c.tour3d) score += 3;
  if (c.isNew) score += 2;
  if (c.ratingCount >= 3) score += Math.max(0, Math.min(2, c.ratingAvg - 3));
  score += Math.min(3, Math.log10(1 + c.views));

  // — Razones, en orden de prioridad —
  const reasons: ReasonCode[] = [];
  const priceOk = prefPrice || priceFit;
  const placeOk = prefLocation || hoodShare > 0 || (km != null && km <= 3);
  if (priceOk && placeOk) reasons.push("loc_price");
  if (profile.sampleSize > 0 && typeShare >= 0.3 && (hoodShare > 0 || (km != null && km <= 8)) && priceNear) {
    reasons.push("similar");
  }
  // Zona que ya le interesa (o cercana) aunque el tipo o el precio no sean los habituales.
  if (!reasons.length && (hoodShare > 0 || (km != null && km <= 8))) reasons.push("near_zone");
  if (co > 0) reasons.push("co_saved");
  if (reasons.length === 0) reasons.push("fits");

  return { score, reasons };
}

export function primaryReason(reasons: ReasonCode[]): ReasonCode {
  return REASON_PRIORITY.find((r) => reasons.includes(r)) ?? "fits";
}

const CANDIDATE_SELECT = `${PROPERTY_CARD_PROJECTION} amenities stats.ratingAvg stats.ratingCount stats.views`;
const CANDIDATE_LIMIT = 300;
const NEARBY_RADIUS_KM = 12;
const EARTH_RADIUS_KM = 6378.1;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Propiedades que el usuario ya guardó o consultó: no se le vuelven a recomendar. */
async function excludedIds(userId: string): Promise<{ excluded: string[]; seeds: string[] }> {
  const uid = new Types.ObjectId(userId);
  const [favorites, likes, leads] = await Promise.all([
    Favorite.find({ userId: uid }).select("propertyId").sort({ createdAt: -1 }).limit(200).lean(),
    Like.find({ userId: uid }).select("propertyId").sort({ createdAt: -1 }).limit(200).lean(),
    Lead.find({ userId: uid }).select("propertyId").limit(100).lean(),
  ]);
  const saved = favorites.map((f) => String(f.propertyId));
  const liked = likes.map((l) => String(l.propertyId));
  const inquired = leads.map((l) => String(l.propertyId));
  return {
    excluded: [...new Set([...saved, ...inquired])],
    seeds: [...new Set([...saved, ...liked])].slice(0, 30),
  };
}

/**
 * "Quienes guardaron lo mismo que vos, ¿qué más guardaron?": cuenta las
 * propiedades guardadas por usuarios que coinciden en alguna propiedad con
 * este usuario. Filtrado colaborativo simple, sin IA.
 */
async function coSavedCounts(userId: string, seeds: string[], excluded: string[]): Promise<Map<string, number>> {
  if (seeds.length === 0) return new Map();
  const seedIds = seeds.map((s) => new Types.ObjectId(s));
  const [favUsers, likeUsers] = await Promise.all([
    Favorite.find({ propertyId: { $in: seedIds }, userId: { $ne: userId } }).select("userId").limit(300).lean(),
    Like.find({ propertyId: { $in: seedIds }, userId: { $ne: userId } }).select("userId").limit(300).lean(),
  ]);
  const similar = [...new Set([...favUsers, ...likeUsers].map((d) => String(d.userId)))].map((u) => new Types.ObjectId(u));
  if (similar.length === 0) return new Map();

  const rows = await Favorite.aggregate([
    { $match: { userId: { $in: similar }, propertyId: { $nin: excluded.map((e) => new Types.ObjectId(e)) } } },
    { $group: { _id: "$propertyId", n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 60 },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.n as number]));
}

/** Lo que más interés tiene en la plataforma esta semana — para quien todavía no dejó señales. */
function getTrending(): Promise<Map<string, number>> {
  return memo("trending-7d", 5 * 60_000, async () => {
    const metrics = await getPropertyMetrics({});
    const entries = [...metrics.values()]
      .map((m) => [m.propertyId, m.w7.views + 3 * m.w7.saves + 5 * (m.w7.inquiries + m.w7.contacts)] as const)
      .filter(([, score]) => score > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50);
    return new Map(entries);
  });
}

/**
 * Recomendaciones para un usuario, con el motivo de cada una. Mejora sola a
 * medida que interactúa. Sin actividad ni preferencias: lo que más interés
 * tiene en la plataforma esta semana.
 */
export async function getRecommendations(userId: string, limit = 12): Promise<Recommendation[]> {
  const [user, profile, { excluded, seeds }] = await Promise.all([
    User.findById(userId).select("preferences").lean(),
    getTasteProfile(userId),
    excludedIds(userId),
  ]);
  const prefs: Preferences = user?.preferences ?? {};

  const hasPrefs = !!(
    prefs.operations?.length ||
    prefs.propertyTypes?.length ||
    prefs.locations?.length ||
    prefs.priceMin != null ||
    prefs.priceMax != null
  );
  const coSaved = await coSavedCounts(userId, seeds, excluded);
  const trending = hasPrefs || profile.sampleSize > 0 ? new Map<string, number>() : await getTrending();

  // Candidatos: lo que coincide con preferencias/perfil (por consulta indexada) + novedades + lo que otros guardaron.
  const base = {
    status: "published",
    ...(excluded.length ? { _id: { $nin: excluded.map((e) => new Types.ObjectId(e)) } } : {}),
  };
  const or: Record<string, unknown>[] = [];
  if (prefs.operations?.length) or.push({ operation: { $in: prefs.operations } });
  if (prefs.propertyTypes?.length) or.push({ type: { $in: prefs.propertyTypes } });
  if (prefs.locations?.length) {
    or.push({ "address.neighborhood": { $in: prefs.locations.map((l) => new RegExp(escapeRegex(l), "i")) } });
  }
  if (profile.neighborhoods.length) or.push({ "address.neighborhood": { $in: profile.neighborhoods.map((n) => n.key) } });
  if (profile.types.length) or.push({ type: { $in: profile.types.slice(0, 2).map((t) => t.key) } });
  for (const c of profile.centroids) {
    or.push({ location: { $geoWithin: { $centerSphere: [[c.lng, c.lat], NEARBY_RADIUS_KM / EARTH_RADIUS_KM] } } });
  }
  const extraIds = [...coSaved.keys(), ...trending.keys()].map((id) => new Types.ObjectId(id));

  const lean = (filter: Record<string, unknown>, max: number, sort: Record<string, 1 | -1> = { publishedAt: -1 }) =>
    Property.find(filter)
      .select(CANDIDATE_SELECT)
      .populate({ path: "agencyId", select: "name" })
      .sort(sort)
      .limit(max)
      .lean();

  const [matching, newest, extra] = await Promise.all([
    or.length ? lean({ ...base, $or: or }, CANDIDATE_LIMIT) : Promise.resolve([]),
    lean(base, 40),
    extraIds.length ? lean({ ...base, _id: { $in: extraIds, ...((base as { _id?: object })._id ?? {}) } }, 100) : Promise.resolve([]),
  ]);

  const unique = new Map<string, (typeof newest)[number]>();
  for (const doc of [...matching, ...newest, ...extra]) unique.set(String(doc._id), doc);

  const now = Date.now();
  const ctx: ScoreContext = { prefs, profile, coSaved };
  const savedBased = profile.savedCount > 0;

  const scored = [...unique.values()].map((doc) => {
    const card = toPropertyCardData(doc, now);
    const candidate: Candidate = {
      id: card.id,
      type: card.type,
      operation: card.operation,
      neighborhood: card.neighborhood,
      currency: card.currency,
      price: card.price,
      bedrooms: card.bedrooms,
      area: card.area,
      amenities: ((doc as { amenities?: string[] }).amenities ?? []) as string[],
      lng: card.lng,
      lat: card.lat,
      tour3d: card.tour3d,
      isNew: card.isNew,
      ratingAvg: doc.stats?.ratingAvg ?? 0,
      ratingCount: doc.stats?.ratingCount ?? 0,
      views: doc.stats?.views ?? 0,
    };
    const result = scoreCandidate(candidate, ctx);
    const trendScore = trending.get(card.id);
    if (trendScore != null) {
      result.score += 10 + Math.min(10, Math.log2(1 + trendScore));
      result.reasons = ["trending"];
    }
    return { card, ...result };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ card, score, reasons }) => ({
    card,
    score,
    reasons,
    reason: REASON_TEXT[primaryReason(reasons)]({ saved: savedBased }),
  }));
}

/** Versión para las tarjetas: la propiedad con el motivo de la recomendación. */
export async function getRecommendedProperties(userId: string, limit = 12): Promise<PropertyCardData[]> {
  const recs = await getRecommendations(userId, limit);
  return recs.map((r) => ({ ...r.card, reason: r.reason }));
}
