import { Types } from "mongoose";
import { Interaction } from "@/lib/db/models/Interaction";
import { Property } from "@/lib/db/models/Property";

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
 */
export async function getAgencyWeeklyStats(agencyId: string): Promise<AgencyWeeklyStats> {
  const now = Date.now();
  const weekMs = 7 * 86_400_000;
  const currentStart = new Date(now - weekMs);
  const previousStart = new Date(now - 2 * weekMs);

  const agg = await Interaction.aggregate([
    {
      $match: {
        agencyId: new Types.ObjectId(agencyId),
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
      "media.tour3d.enabled": { $ne: true },
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
