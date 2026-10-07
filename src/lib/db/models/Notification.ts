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
  "agency_request", // (admin) alguien solicitó gestionar una inmobiliaria
  "agency_approved", // (usuario) su solicitud fue aprobada
  "agency_rejected",
  "lead", // (inmobiliaria) nueva consulta sobre una propiedad
  "opportunity", // (inmobiliaria) hallazgo del centro de oportunidades
  "follow_new_property", // nueva propiedad de una inmobiliaria que el usuario sigue
  "admin_alert", // (admin) situación que requiere atención
  "social_post", // (inmobiliaria) publicación para redes lista
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
    /**
     * Clave opcional para no repetir un aviso (ej: `reco:<propertyId>`,
     * `opp:<propertyId>:2026-W41`). Único por usuario sólo cuando existe.
     */
    dedupeKey: { type: String },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index(
  { userId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } }
);

export type NotificationDoc = InferSchemaType<typeof notificationSchema>;

export const Notification: Model<NotificationDoc> =
  models.Notification ?? model<NotificationDoc>("Notification", notificationSchema);
