import { Notification, NOTIFICATION_TYPES } from "@/lib/db/models/Notification";

type NotificationInput = {
  userId: string;
  type: (typeof NOTIFICATION_TYPES)[number];
  title: string;
  body?: string;
  href?: string;
  propertyId?: string;
};

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
    });
  } catch (err) {
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
      }))
    );
  } catch (err) {
    console.error("createNotificationForMany failed:", err);
  }
}
