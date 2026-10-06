import { Notification, NOTIFICATION_TYPES } from "@/lib/db/models/Notification";
import { User } from "@/lib/db/models/User";

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

/** Crea una notificación interna. Nunca lanza — un fallo acá no debe romper el flujo principal. */
export async function createNotification(input: NotificationInput): Promise<void> {
  try {
    await Notification.create({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? "",
      href: input.href,
      propertyId: input.propertyId ?? null,
      dedupeKey: input.dedupeKey,
    });
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
  try {
    await Notification.insertMany(
      userIds.map((userId) => ({
        userId,
        type: rest.type,
        title: rest.title,
        body: rest.body ?? "",
        href: rest.href,
        propertyId: rest.propertyId ?? null,
        dedupeKey: rest.dedupeKey,
      })),
      // ordered:false — un duplicado (dedupeKey) no debe impedir avisar al resto.
      { ordered: false }
    );
  } catch (err) {
    if (isDuplicateKeyError(err)) return;
    console.error("createNotificationForMany failed:", err);
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
