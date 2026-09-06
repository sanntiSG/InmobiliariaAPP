import { Types } from "mongoose";
import { Interaction } from "@/lib/db/models/Interaction";
import { Property } from "@/lib/db/models/Property";
import { Agency } from "@/lib/db/models/Agency";

export type WeeklyMetric = { current: number; previous: number; deltaPct: number | null };
export type AgencyWeeklyStats = {
  views: WeeklyMetric;
  likes: WeeklyMetric;
  saves: WeeklyMetric;
  comments: WeeklyMetric;
};

function computeDeltaPct(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Estadísticas semana vs. semana anterior, calculadas por agregación sobre
 * el log de Interaction — sin IA, pura lógica tradicional (ver CLAUDE.md).
 *
 * `agencyId: null` agrega la plataforma entera (vista del admin).
 */
export async function getAgencyWeeklyStats(agencyId: string | null): Promise<AgencyWeeklyStats> {
  const now = Date.now();
  const weekMs = 7 * 86_400_000;
  const currentStart = new Date(now - weekMs);
  const previousStart = new Date(now - 2 * weekMs);

  const agg = await Interaction.aggregate([
    {
      $match: {
        ...(agencyId ? { agencyId: new Types.ObjectId(agencyId) } : {}),
        createdAt: { $gte: previousStart },
        type: { $in: ["view", "like", "save", "comment"] },
      },
    },
    {
      $group: {
        _id: { type: "$type", period: { $cond: [{ $gte: ["$createdAt", currentStart] }, "current", "previous"] } },
        count: { $sum: 1 },
      },
    },
  ]);

  const counts: Record<string, Record<string, number>> = {};
  for (const row of agg) {
    const type = row._id.type as string;
    const period = row._id.period as string;
    counts[type] ??= {};
    counts[type][period] = row.count;
  }

  function metric(type: string): WeeklyMetric {
    const current = counts[type]?.current ?? 0;
    const previous = counts[type]?.previous ?? 0;
    return { current, previous, deltaPct: computeDeltaPct(current, previous) };
  }

  return {
    views: metric("view"),
    likes: metric("like"),
    saves: metric("save"),
    comments: metric("comment"),
  };
}

export type AgencyRankingRow = {
  agencyId: string;
  name: string;
  views: number;
  likes: number;
  saves: number;
  comments: number;
};

/**
 * Ranking de inmobiliarias por actividad de los últimos 7 días — para el
 * panel de estadísticas globales del admin. Misma fuente (Interaction),
 * agregada por agencia en vez de por tipo/período.
 */
export async function getAgencyRanking(limit = 10): Promise<AgencyRankingRow[]> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  const agg = await Interaction.aggregate([
    { $match: { createdAt: { $gte: weekAgo }, type: { $in: ["view", "like", "save", "comment"] } } },
    { $group: { _id: { agencyId: "$agencyId", type: "$type" }, count: { $sum: 1 } } },
  ]);

  const byAgency: Record<string, { views: number; likes: number; saves: number; comments: number }> = {};
  for (const row of agg) {
    const id = String(row._id.agencyId);
    byAgency[id] ??= { views: 0, likes: 0, saves: 0, comments: 0 };
    const type = row._id.type as string;
    if (type === "view") byAgency[id].views = row.count;
    else if (type === "like") byAgency[id].likes = row.count;
    else if (type === "save") byAgency[id].saves = row.count;
    else if (type === "comment") byAgency[id].comments = row.count;
  }

  const ids = Object.keys(byAgency);
  if (ids.length === 0) return [];

  const agencies = await Agency.find({ _id: { $in: ids } }).select("name").lean();
  const nameById = new Map(agencies.map((a) => [String(a._id), a.name]));

  return ids
    .map((id) => ({ agencyId: id, name: nameById.get(id) ?? "—", ...byAgency[id] }))
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);
}

export type Recommendation = { id: string; severity: "info" | "warning"; message: string };

/**
 * Recomendaciones por umbrales sobre datos reales (no IA) — ver brief:
 * "decayeron las vistas, se recomienda subir nuevas fotos", etc.
 */
export async function getAgencyRecommendations(
  agencyId: string,
  stats: AgencyWeeklyStats
): Promise<Recommendation[]> {
  const recs: Recommendation[] = [];
  const agencyObjectId = new Types.ObjectId(agencyId);

  const [publishedCount, fewPhotosCount, noTourCount, lastPublished] = await Promise.all([
    Property.countDocuments({ agencyId: agencyObjectId, status: "published" }),
    Property.countDocuments({
      agencyId: agencyObjectId,
      status: "published",
      $expr: { $lt: [{ $size: { $ifNull: ["$media.images", []] } }, 3] },
    }),
    Property.countDocuments({
      agencyId: agencyObjectId,
      status: "published",
      "media.hasTour3d": { $ne: true },
    }),
    Property.findOne({ agencyId: agencyObjectId, status: "published" })
      .sort({ publishedAt: -1 })
      .select("publishedAt")
      .lean(),
  ]);

  if (stats.views.deltaPct != null && stats.views.deltaPct <= -15) {
    recs.push({
      id: "views-down",
      severity: "warning",
      message: `Las visualizaciones bajaron ${Math.abs(stats.views.deltaPct)}% esta semana. Subí fotos nuevas o sumá un recorrido 3D para reactivar el interés.`,
    });
  }
  if (publishedCount < 3) {
    recs.push({
      id: "few-properties",
      severity: "info",
      message: "Tenés pocas propiedades publicadas. Publicar más aumenta tu alcance en el mapa y el listado.",
    });
  }
  if (fewPhotosCount > 0) {
    recs.push({
      id: "few-photos",
      severity: "info",
      message: `${fewPhotosCount} propiedad${fewPhotosCount > 1 ? "es" : ""} ${fewPhotosCount > 1 ? "tienen" : "tiene"} menos de 3 fotos. Las publicaciones con más fotos reciben más visualizaciones.`,
    });
  }
  if (noTourCount > 0) {
    recs.push({
      id: "no-tour",
      severity: "info",
      message: `${noTourCount} propiedad${noTourCount > 1 ? "es" : ""} no ${noTourCount > 1 ? "tienen" : "tiene"} recorrido 3D. Sumar un Digital Twin destaca tu publicación.`,
    });
  }

  const daysSincePublish = lastPublished?.publishedAt
    ? (Date.now() - new Date(lastPublished.publishedAt).getTime()) / 86_400_000
    : Infinity;
  if (daysSincePublish > 30) {
    recs.push({
      id: "stale",
      severity: "warning",
      message: "Hace más de 30 días que no publicás una propiedad nueva.",
    });
  }

  return recs;
}
