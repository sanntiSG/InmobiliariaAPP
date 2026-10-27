/**
 * El envío de avisos al dispositivo. Un aviso (`Notification` con `push.state = "pending"`) se intenta apenas se crea, desde el
 * servidor que lo creó si tiene las claves VAPID, y si no —o si falla— lo retoma la tarea programada de Netlify (cada 5 minutos).
 * Reglas:
 * - Un solo envío por aviso: pasa de `pending` a `sending` con una operación atómica (dos servidores a la vez no lo duplican) y
 *   los avisos nuevos ya nacen deduplicados por `dedupeKey` (un evento procesado dos veces no crea dos avisos).
 * - Respeta a la persona: grupo silenciado o avisos en pausa → `skipped`; nunca se envía a quien no se suscribió.
 * - Errores controlados: 404/410 del servicio (dispositivo que ya no existe) borran la suscripción; otros fallos reintentan hasta
 *   3 veces y una suscripción que falla 5 veces seguidas se desactiva. Un fallo acá NUNCA rompe lo que generó el aviso.
 * - Lo que lleva más de 24 horas sin enviarse se descarta: un aviso viejo ya no sirve.
 */
import { brand } from "@/config/brand";
import { MUTABLE_GROUPS, groupOf } from "@/config/notifications";
import { connectDB } from "@/lib/db/connect";
import { Notification } from "@/lib/db/models/Notification";
import { PushSubscription } from "@/lib/db/models/PushSubscription";
import { User } from "@/lib/db/models/User";
import { buildPushPayload, type PushPayload } from "./payload";
import { vapidConfig, type VapidConfig } from "./vapid";

export const PUSH_LIMITS = { maxAttempts: 3, disableAfterFailures: 5, expireHours: 24, stuckMinutes: 5, ttlSeconds: 6 * 3600, perUser: 10 } as const;

export type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } };

/** El envío a UN dispositivo. Se inyecta en las pruebas; en producción usa `web-push`. */
export type PushSender = (target: PushTarget, payload: PushPayload) => Promise<void>;

export type DispatchResult = { claimed: number; sent: number; skipped: number; failed: number; retry: number; removed: number; expired: number };

/** El envío real, con las claves VAPID de este despliegue. */
export function webPushSender(cfg: VapidConfig): PushSender {
  return async (target, payload) => {
    const webpush = (await import("web-push")).default;
    await webpush.sendNotification({ endpoint: target.endpoint, keys: target.keys }, JSON.stringify(payload), {
      vapidDetails: { subject: cfg.subject, publicKey: cfg.publicKey, privateKey: cfg.privateKey },
      TTL: PUSH_LIMITS.ttlSeconds,
      urgency: "normal",
      timeout: 6000,
    });
  };
}

/** El código de estado HTTP que devolvió el servicio de push (si lo hubo). */
const statusOf = (err: unknown): number | null => {
  const code = (err as { statusCode?: number })?.statusCode;
  return typeof code === "number" ? code : null;
};

export type DispatchOptions = {
  /** Sólo los avisos de estas personas (el intento inmediato al crearlos). Sin esto, todos los pendientes (la tarea programada). */
  userIds?: string[];
  deadline?: number;
  limit?: number;
  now?: Date;
  /** Para pruebas. */
  sender?: PushSender;
};

export async function dispatchPending(opts: DispatchOptions = {}): Promise<DispatchResult> {
  const result: DispatchResult = { claimed: 0, sent: 0, skipped: 0, failed: 0, retry: 0, removed: 0, expired: 0 };
  const cfg = opts.sender ? null : vapidConfig();
  // Sin claves en este despliegue no se toca nada: lo envía el que las tenga (sin perder el aviso).
  if (!opts.sender && !cfg) return result;
  const send = opts.sender ?? webPushSender(cfg!);
  const now = opts.now ?? new Date();
  const deadline = opts.deadline ?? now.getTime() + 8_000;

  await connectDB();
  const expiredBefore = new Date(now.getTime() - PUSH_LIMITS.expireHours * 3_600_000);
  if (!opts.userIds) {
    // Lo que quedó "enviando" hace rato (se cortó el proceso) vuelve a la cola; lo demasiado viejo se descarta.
    await Notification.updateMany({ "push.state": "sending", "push.at": { $lt: new Date(now.getTime() - PUSH_LIMITS.stuckMinutes * 60_000) } }, { $set: { "push.state": "pending" } });
    const old = await Notification.updateMany({ "push.state": "pending", createdAt: { $lt: expiredBefore } }, { $set: { "push.state": "skipped", "push.at": now } });
    result.expired = old.modifiedCount;
  }

  const query: Record<string, unknown> = { "push.state": "pending", createdAt: { $gte: expiredBefore } };
  if (opts.userIds) query.userId = { $in: opts.userIds };
  const pending = await Notification.find(query).sort({ createdAt: 1 }).limit(opts.limit ?? 100).select("userId type title body href").lean();
  if (pending.length === 0) return result;

  const userIds = [...new Set(pending.map((n) => String(n.userId)))];
  const [users, subs] = await Promise.all([
    User.find({ _id: { $in: userIds } }).select("notificationPrefs").lean(),
    PushSubscription.find({ userId: { $in: userIds }, disabledAt: null }).select("userId endpoint keys").lean(),
  ]);
  const prefsOf = new Map(users.map((u) => [String(u._id), u.notificationPrefs]));
  const subsOf = new Map<string, typeof subs>();
  for (const s of subs) subsOf.set(String(s.userId), [...(subsOf.get(String(s.userId)) ?? []), s]);

  for (const n of pending) {
    if (Date.now() > deadline) break;
    // Atómico: si otro servidor ya lo tomó, éste lo salta.
    const claimed = await Notification.findOneAndUpdate({ _id: n._id, "push.state": "pending" }, { $set: { "push.state": "sending", "push.at": now }, $inc: { "push.attempts": 1 } }, { returnDocument: "after" }).select("push.attempts");
    if (!claimed) continue;
    result.claimed++;

    const uid = String(n.userId);
    const prefs = prefsOf.get(uid);
    const group = groupOf(n.type);
    const mine = subsOf.get(uid) ?? [];
    const silenced = prefs?.pushPaused || (MUTABLE_GROUPS.includes(group) && (prefs?.muted ?? []).includes(group));
    if (silenced || mine.length === 0) {
      await Notification.updateOne({ _id: n._id }, { $set: { "push.state": "skipped", "push.at": now } });
      result.skipped++;
      continue;
    }

    const payload = buildPushPayload({ id: String(n._id), type: n.type, title: n.title, body: n.body, href: n.href }, brand.name);
    const outcomes = await Promise.all(
      mine.map(async (s) => {
        try {
          await send({ endpoint: s.endpoint, keys: { p256dh: s.keys?.p256dh ?? "", auth: s.keys?.auth ?? "" } }, payload);
          await PushSubscription.updateOne({ _id: s._id }, { $set: { failures: 0, lastSuccessAt: now } });
          return "ok" as const;
        } catch (err) {
          const code = statusOf(err);
          if (code === 404 || code === 410) {
            // El dispositivo ya no existe (se desinstaló o se revocó el permiso): se borra.
            await PushSubscription.deleteOne({ _id: s._id });
            result.removed++;
            return "gone" as const;
          }
          const updated = await PushSubscription.findOneAndUpdate({ _id: s._id }, { $inc: { failures: 1 }, $set: { lastFailureAt: now } }, { returnDocument: "after" }).select("failures");
          if ((updated?.failures ?? 0) >= PUSH_LIMITS.disableAfterFailures) await PushSubscription.updateOne({ _id: s._id }, { $set: { disabledAt: now } });
          // 4xx (salvo 429) no se arregla reintentando; el resto (red, 5xx, 429) sí puede.
          return code != null && code >= 400 && code < 500 && code !== 429 ? ("rejected" as const) : ("transient" as const);
        }
      })
    );

    if (outcomes.includes("ok")) {
      await Notification.updateOne({ _id: n._id }, { $set: { "push.state": "sent", "push.at": now } });
      result.sent++;
    } else if (outcomes.includes("transient") && (claimed.push?.attempts ?? 1) < PUSH_LIMITS.maxAttempts) {
      await Notification.updateOne({ _id: n._id }, { $set: { "push.state": "pending" } });
      result.retry++;
    } else {
      await Notification.updateOne({ _id: n._id }, { $set: { "push.state": outcomes.every((o) => o === "gone") ? "skipped" : "failed", "push.at": now } });
      if (outcomes.every((o) => o === "gone")) result.skipped++;
      else result.failed++;
    }
  }
  return result;
}
