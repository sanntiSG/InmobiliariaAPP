import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";

/**
 * Aviso "se eliminó tu inmobiliaria". Al borrar una inmobiliaria se borran
 * también las cuentas de su equipo, así que no hay usuario ni notificaciones
 * donde guardarlo: se ata al **email** y se muestra la primera vez que esa
 * persona vuelve a entrar (con la cuenta recreada). Se ve una sola vez
 * (`seenAt`) y los avisos que nunca se vieron caducan solos a los 180 días.
 */
const agencyDeletionNoticeSchema = new Schema(
  {
    email: { type: String, required: true, index: true, lowercase: true, trim: true },
    agencyName: { type: String, required: true, trim: true, maxlength: 120 },
    deletedAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 180 },
    seenAt: { type: Date, default: null },
  },
  { timestamps: false }
);

export type AgencyDeletionNoticeDoc = InferSchemaType<typeof agencyDeletionNoticeSchema>;

export const AgencyDeletionNotice: Model<AgencyDeletionNoticeDoc> =
  models.AgencyDeletionNotice ??
  model<AgencyDeletionNoticeDoc>("AgencyDeletionNotice", agencyDeletionNoticeSchema);
