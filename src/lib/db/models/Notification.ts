import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";

/**
 * Notificaciones internas (v1): visibles al ingresar a la plataforma.
 * `type` deja lugar para nuevos disparadores sin romper el esquema;
 * canales futuros (push/email) se agregan como campo `channel` más adelante.
 */
export const NOTIFICATION_TYPES = [
  "new_match", // nueva propiedad que matchea preferencias
  "price_drop",
  "recommendation",
  "comment_reply",
  "activity", // le gustó/comentó algo que el usuario también sigue
  "system",
] as const;

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    /** Link relativo al que navega la notificación (ej: /propiedades/slug). */
    href: { type: String },
    propertyId: { type: Schema.Types.ObjectId, ref: "Property", default: null },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export type NotificationDoc = InferSchemaType<typeof notificationSchema>;

export const Notification: Model<NotificationDoc> =
  models.Notification ?? model<NotificationDoc>("Notification", notificationSchema);
