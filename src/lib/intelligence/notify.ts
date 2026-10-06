import { Agency } from "@/lib/db/models/Agency";
import { AgencyRequest } from "@/lib/db/models/AgencyRequest";
import { Notification } from "@/lib/db/models/Notification";
import { Property } from "@/lib/db/models/Property";
import { PropertyDailyStat } from "@/lib/db/models/PropertyDailyStat";
import { createNotification, createNotificationForMany, notifyAdmins } from "@/lib/notifications/create";
import { agencyMemberIds } from "@/lib/notifications/agency-members";
import { getRecommendations, type ReasonCode } from "@/lib/recommendations/engine";
import { memo } from "./cache";
import { getIntelligence } from "./opportunities";
import { dayStart } from "@/lib/tracking/record";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Clave de semana (año-semana ISO) para limitar avisos repetidos a uno por semana. */
export function weekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Sólo se notifica por motivos "fuertes": un "podría encajar" genérico no justifica interrumpir. */
const STRONG_REASONS: ReasonCode[] = ["loc_price", "similar", "near_zone", "co_saved"];
const MAX_RECOMMENDATIONS_PER_DAY = 2;

/**
 * Notificaciones de recomendación para un usuario — sin cron: se llaman (en
 * `after()`) cuando la persona consulta sus notificaciones, como mucho una
 * vez por día, y nunca repiten una propiedad ya avisada.
 */
export async function maybeSendRecommendationNotifications(userId: string): Promise<void> {
  try {
    const recent = await Notification.exists({
      userId,
      type: "recommendation",
      createdAt: { $gte: new Date(Date.now() - DAY_MS) },
    });
    if (recent) return;

    const recs = (await getRecommendations(userId, 10)).filter((r) => r.reasons.some((x) => STRONG_REASONS.includes(x)));
    if (recs.length === 0) return;

    const keys = recs.map((r) => `reco:${r.card.id}`);
    const already = new Set(
      (await Notification.find({ userId, dedupeKey: { $in: keys } }).select("dedupeKey").lean()).map((n) => n.dedupeKey)
    );

    for (const rec of recs.filter((r) => !already.has(`reco:${r.card.id}`)).slice(0, MAX_RECOMMENDATIONS_PER_DAY)) {
      await createNotification({
        userId,
        type: "recommendation",
        title: "Una propiedad para vos",
        body: `${rec.reason} · ${rec.card.title}`,
        href: `/propiedades/${rec.card.slug}`,
        propertyId: rec.card.id,
        dedupeKey: `reco:${rec.card.id}`,
      });
    }
  } catch (err) {
    console.error("maybeSendRecommendationNotifications failed:", err);
  }
}

/**
 * Avisa a la inmobiliaria de los hallazgos importantes (severidad alta) que
 * detecta su centro de oportunidades. Como mucho 3 por semana y por hallazgo,
 * y se evalúa a lo sumo una vez por hora.
 */
export function maybeSendOpportunityNotifications(agencyId: string): Promise<void> {
  return memo(`opp-notify:${agencyId}`, HOUR_MS, async () => {
    try {
      const { opportunities } = await getIntelligence(agencyId);
      const important = opportunities.filter((o) => o.severity === "high" && o.kind !== "opportunity").slice(0, 3);
      if (important.length === 0) return;

      const week = weekKey();
      const members = await agencyMemberIds(agencyId);
      for (const o of important) {
        await createNotificationForMany(members, {
          type: "opportunity",
          title: o.title,
          body: o.propertyTitle ? `${o.propertyTitle} — ${o.explanation}` : o.explanation,
          href: o.href ?? "/dashboard/oportunidades",
          propertyId: o.propertyId,
          dedupeKey: `opp:${o.id}:${week}`,
        });
      }
    } catch (err) {
      console.error("maybeSendOpportunityNotifications failed:", err);
    }
  });
}

/** Una solicitud de inmobiliaria que lleva más que esto sin resolverse requiere atención. */
const REQUEST_ALERT_AFTER_MS = 48 * HOUR_MS;

/**
 * Alertas para el administrador general: solicitudes sin resolver hace más de
 * 48 h e inmobiliarias con propiedades publicadas pero sin una sola visita en
 * 14 días. Se evalúan a lo sumo cada 30 minutos; los avisos no se repiten.
 */
export function sendAdminAlerts(): Promise<void> {
  return memo("admin-alerts", 30 * 60_000, async () => {
    try {
      const stale = await AgencyRequest.find({
        status: "pending",
        createdAt: { $lte: new Date(Date.now() - REQUEST_ALERT_AFTER_MS) },
      })
        .select("name agencyName")
        .limit(20)
        .lean();
      for (const r of stale) {
        await notifyAdmins({
          type: "admin_alert",
          title: "Solicitud sin resolver hace más de 48 horas",
          body: `${r.name} · ${r.agencyName}`,
          href: "/admin/solicitudes",
          dedupeKey: `admin_alert:request:${r._id}`,
        });
      }

      const since = new Date(dayStart().getTime() - 13 * DAY_MS);
      const [published, active] = await Promise.all([
        Property.aggregate([{ $match: { status: "published" } }, { $group: { _id: "$agencyId", n: { $sum: 1 } } }]),
        PropertyDailyStat.aggregate([
          { $match: { day: { $gte: since }, views: { $gt: 0 } } },
          { $group: { _id: "$agencyId" } },
        ]),
      ]);
      // Si nadie en toda la plataforma recibió una visita, todavía no hay tráfico medido:
      // avisar que "todas" están inactivas sería ruido, no información.
      if (active.length === 0) return;
      const withViews = new Set(active.map((a) => String(a._id)));
      const inactiveIds = published.filter((p) => !withViews.has(String(p._id))).map((p) => p._id);
      if (inactiveIds.length === 0) return;

      const agencies = await Agency.find({ _id: { $in: inactiveIds }, status: "active" }).select("name").limit(20).lean();
      const week = weekKey();
      for (const a of agencies) {
        await notifyAdmins({
          type: "admin_alert",
          title: "Inmobiliaria sin actividad",
          body: `${a.name} tiene propiedades publicadas pero no recibió visitas en 14 días.`,
          href: `/admin`,
          dedupeKey: `admin_alert:inactive:${a._id}:${week}`,
        });
      }
    } catch (err) {
      console.error("sendAdminAlerts failed:", err);
    }
  });
}
