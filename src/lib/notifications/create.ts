import { after } from "next/server";
import { Notification, NOTIFICATION_TYPES } from "@/lib/db/models/Notification";
import { PushSubscription } from "@/lib/db/models/PushSubscription";
import { User } from "@/lib/db/models/User";
import { MUTABLE_GROUPS, groupOf } from "@/config/notifications";
import { dispatchPending } from "@/lib/push/send";

type NotificationInput = {
  userId: string;
  type: (typeof NOTIFICATION_TYPES)[number];
  title: string;
  body?: string;
  href?: string;
  propertyId?: string;
  /** Si ya existe una notificación con esta clave para el usuario, no se crea otra. */
  dedupeKey?: string;
};

const isDuplicateKeyError = (err: unknown) =>
  (err as { code?: number })?.code === 11000 ||
  (err as { writeErrors?: { err?: { code?: number } }[] })?.writeErrors?.every((w) => w.err?.code === 11000);

/** De esa lista, quiénes silenciaron el grupo de este tipo (el grupo "sistema" nunca se silencia). */
async function mutedBy(userIds: string[], type: string): Promise<Set<string>> {
  const group = groupOf(type);
  if (!MUTABLE_GROUPS.includes(group) || userIds.length === 0) return new Set();
  const rows = await User.find({ _id: { $in: userIds }, "notificationPrefs.muted": group }).select("_id").lean();
  return new Set(rows.map((r) => String(r._id)));
}

/** De esa lista, quiénes tienen al menos un dispositivo activo: sólo a ellos se les prepara el aviso del dispositivo. */
async function withDevices(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const ids = await PushSubscription.distinct("userId", { userId: { $in: userIds }, disabledAt: null });
  return new Set(ids.map(String));
}

/**
 * Intenta enviar ya los avisos del dispositivo, sin hacer esperar a quien los generó: dentro de la respuesta de la acción (`after`)
 * y, si no hay una respuesta en curso, en segundo plano. Si no llega a enviarse (otro servidor sin claves, un corte), queda
 * pendiente y lo toma la tarea programada de Netlify. Nunca lanza.
 */
function scheduleDispatch(userIds: string[]) {
  if (userIds.length === 0) return;
  const run = () => dispatchPending({ userIds }).then(() => undefined).catch((err) => console.error("push dispatch failed:", (err as Error)?.message));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** Crea una notificación interna. Nunca lanza — un fallo acá no debe romper el flujo principal. */
export async function createNotification(input: NotificationInput): Promise<void> {
  try {
    // La persona puede silenciar un grupo: no se crea ni la notificación ni el aviso del dispositivo.
    if ((await mutedBy([input.userId], input.type)).has(input.userId)) return;
    const devices = await withDevices([input.userId]);
    await Notification.create({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? "",
      href: input.href,
      propertyId: input.propertyId ?? null,
      dedupeKey: input.dedupeKey,
      ...(devices.has(input.userId) ? { push: { state: "pending" } } : {}),
    });
    // Sólo si se creó (un duplicado cae en el `catch` de abajo y no vuelve a avisar).
    if (devices.has(input.userId)) scheduleDispatch([input.userId]);
  } catch (err) {
    if (isDuplicateKeyError(err)) return;
    console.error("createNotification failed:", err);
  }
}

/** Crea la misma notificación para varios usuarios (ej: nueva propiedad que matchea). */
export async function createNotificationForMany(
  userIds: string[],
  rest: Omit<NotificationInput, "userId">
): Promise<void> {
  if (userIds.length === 0) return;
  let devices = new Set<string>();
  try {
    const muted = await mutedBy(userIds, rest.type);
    const targets = muted.size > 0 ? userIds.filter((u) => !muted.has(u)) : userIds;
    if (targets.length === 0) return;
    devices = await withDevices(targets);
    await Notification.insertMany(
      targets.map((userId) => ({
        userId,
        type: rest.type,
        title: rest.title,
        body: rest.body ?? "",
        href: rest.href,
        propertyId: rest.propertyId ?? null,
        dedupeKey: rest.dedupeKey,
        ...(devices.has(userId) ? { push: { state: "pending" } } : {}),
      })),
      // ordered:false — un duplicado (dedupeKey) no debe impedir avisar al resto.
      { ordered: false }
    );
  } catch (err) {
    if (!isDuplicateKeyError(err)) console.error("createNotificationForMany failed:", err);
  } finally {
    // Los que quedaron pendientes (los duplicados nunca se crearon, así que no se vuelven a enviar).
    scheduleDispatch([...devices]);
  }
}

/** Avisa a todos los admins de la plataforma (solicitudes pendientes, alertas). */
export async function notifyAdmins(rest: Omit<NotificationInput, "userId">): Promise<void> {
  try {
    const admins = await User.find({ role: "admin" }).select("_id").lean();
    await createNotificationForMany(
      admins.map((a) => String(a._id)),
      rest
    );
  } catch (err) {
    console.error("notifyAdmins failed:", err);
  }
}
