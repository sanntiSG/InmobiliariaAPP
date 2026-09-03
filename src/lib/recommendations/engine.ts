import { Property } from "@/lib/db/models/Property";
import { Interaction } from "@/lib/db/models/Interaction";
import { User } from "@/lib/db/models/User";
import { toPropertyCardData } from "@/lib/db/property-card-mapper";
import { PROPERTY_CARD_PROJECTION } from "@/lib/db/property-query";
import type { PropertyCardData } from "@/components/property/types";

const INTERACTION_WEIGHT: Record<string, number> = { view: 1, like: 2, save: 3 };

type BehaviorSignals = {
  neighborhoods: Map<string, number>;
  types: Map<string, number>;
  avgPrice: number | null;
};

/** Señales implícitas: qué barrios/tipos/rango de precio le interesan según su actividad real. */
async function getBehaviorSignals(userId: string): Promise<BehaviorSignals> {
  const interactions = await Interaction.find({ userId, type: { $in: ["view", "like", "save"] } })
    .sort({ createdAt: -1 })
    .limit(200)
    .select("propertyId type")
    .lean();

  const neighborhoods = new Map<string, number>();
  const types = new Map<string, number>();
  if (interactions.length === 0) return { neighborhoods, types, avgPrice: null };

  const propertyIds = [...new Set(interactions.map((i) => String(i.propertyId)))];
  const props = await Property.find({ _id: { $in: propertyIds } })
    .select("address.neighborhood type price.amount")
    .lean();
  const byId = new Map(props.map((p) => [String(p._id), p]));

  let priceSum = 0;
  let priceCount = 0;

  for (const interaction of interactions) {
    const prop = byId.get(String(interaction.propertyId));
    if (!prop) continue;
    const w = INTERACTION_WEIGHT[interaction.type] ?? 1;

    if (prop.address?.neighborhood) {
      neighborhoods.set(prop.address.neighborhood, (neighborhoods.get(prop.address.neighborhood) ?? 0) + w);
    }
    if (prop.type) {
      types.set(prop.type, (types.get(prop.type) ?? 0) + w);
    }
    if (prop.price?.amount) {
      priceSum += prop.price.amount;
      priceCount++;
    }
  }

  return { neighborhoods, types, avgPrice: priceCount > 0 ? priceSum / priceCount : null };
}

/**
 * Recomendador por lógica tradicional (sin IA): combina preferencias
 * explícitas del usuario con señales implícitas derivadas de su actividad
 * real (vistas, likes, guardados) — ver CLAUDE.md.
 */
export async function getRecommendedProperties(userId: string, limit = 12): Promise<PropertyCardData[]> {
  const [user, signals] = await Promise.all([
    User.findById(userId).select("preferences").lean(),
    getBehaviorSignals(userId),
  ]);
  const prefs: {
    operations?: string[] | null;
    propertyTypes?: string[] | null;
    locations?: string[] | null;
    priceMin?: number | null;
    priceMax?: number | null;
    minRooms?: number | null;
  } = user?.preferences ?? {};

  const candidates = await Property.find({ status: "published" })
    .select(PROPERTY_CARD_PROJECTION)
    .populate({ path: "agencyId", select: "name" })
    .sort({ publishedAt: -1 })
    .limit(200)
    .lean();

  const now = Date.now();
  const scored = candidates.map((doc) => {
    const card = toPropertyCardData(doc, now);
    let score = 0;

    if (prefs.operations?.includes(card.operation)) score += 3;
    if (prefs.propertyTypes?.includes(card.type)) score += 3;
    if (prefs.minRooms && card.bedrooms != null && card.bedrooms >= prefs.minRooms) score += 1;
    if (prefs.priceMin != null && prefs.priceMax != null && card.price >= prefs.priceMin && card.price <= prefs.priceMax) {
      score += 3;
    }
    if (prefs.locations?.some((loc) => card.neighborhood?.toLowerCase().includes(loc.toLowerCase()))) {
      score += 3;
    }

    if (card.neighborhood) score += Math.min(signals.neighborhoods.get(card.neighborhood) ?? 0, 5);
    score += Math.min(signals.types.get(card.type) ?? 0, 3);
    if (signals.avgPrice != null) {
      const diff = Math.abs(card.price - signals.avgPrice) / signals.avgPrice;
      if (diff < 0.25) score += 2;
      else if (diff < 0.5) score += 1;
    }

    if (card.tour3d) score += 0.5;
    if (card.isNew) score += 0.5;

    return { card, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.card);
}
