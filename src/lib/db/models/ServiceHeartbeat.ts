import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";

/**
 * Señal de vida de un servicio automático (hoy, la revisión del correo): cuándo corrió por última vez y desde qué dirección.
 * Un documento por servicio. Sirve para que el panel del admin diga "la revisión corrió hace 3 minutos" y para que la web
 * de respaldo (que comparte la base) sepa cuál es la principal. Sólo guarda tiempos, conteos y una dirección https pública.
 */
const serviceHeartbeatSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, maxlength: 40 },
    lastRunAt: { type: Date, default: null },
    /** Última corrida que terminó sin error. */
    lastOkAt: { type: Date, default: null },
    siteUrl: { type: String, default: null, maxlength: 200 },
    stats: {
      polled: { type: Number, default: 0 },
      drafts: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      errors: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export type ServiceHeartbeatDoc = InferSchemaType<typeof serviceHeartbeatSchema>;

export const ServiceHeartbeat: Model<ServiceHeartbeatDoc> = models.ServiceHeartbeat ?? model<ServiceHeartbeatDoc>("ServiceHeartbeat", serviceHeartbeatSchema);
