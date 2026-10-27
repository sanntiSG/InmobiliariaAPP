import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";
import { MAIL_LIMITS, MAIL_MODES } from "@/lib/mail/constants";

/**
 * Cómo responde el agente de correo de una inmobiliaria. Todo lo edita el dueño o el admin; los agentes del equipo sólo
 * confirman borradores. Nace en modo "confirmación": nada se envía solo hasta que alguien lo activa a propósito.
 */
const mailSettingsSchema = new Schema(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: "Agency", required: true, unique: true },
    mode: { type: String, enum: MAIL_MODES, default: "confirm" },
    /** Cómo firma la respuesta ("Equipo de Umbral Norte"). Vacío: usa el nombre de la inmobiliaria. */
    signature: { type: String, default: "", maxlength: 200, trim: true },
    /** Frase inicial opcional después del saludo ("Gracias por escribirnos."). */
    greeting: { type: String, default: "", maxlength: 160, trim: true },
    /** Frase final opcional antes de la firma ("Quedamos atentos."). */
    closing: { type: String, default: "", maxlength: 160, trim: true },
    /** Avisar en las respuestas automáticas que las preparó un asistente. */
    disclose: { type: Boolean, default: true },
    /** Firma corporativa en HTML debajo de cada respuesta (logo, dirección, contacto y redes, ver `lib/mail/signature.ts`). */
    banner: { type: Boolean, default: true },
    /** Cuántas propiedades como máximo incluye una respuesta. */
    maxProperties: { type: Number, default: 3, min: MAIL_LIMITS.maxPropertiesMin, max: MAIL_LIMITS.maxPropertiesMax },
    /** Categorías que se pueden responder sin confirmar (sólo en modo automático). */
    autoCategories: { type: [String], default: ["availability", "price", "features", "general"] },
    /** Tope de respuestas automáticas por día. */
    autoPerDay: { type: Number, default: MAIL_LIMITS.autoPerDayDefault, min: 1, max: MAIL_LIMITS.autoPerDayMax },
    /** Respuestas automáticas a una misma persona en un día (frena bucles y spam sin impedir las preguntas de seguimiento). */
    autoPerSender: { type: Number, default: MAIL_LIMITS.autoPerSenderDefault, min: 1, max: MAIL_LIMITS.autoPerSenderMax },
    /** También responder solo cuando piden algo ("casas en venta en Ezeiza") y hay propiedades publicadas que coinciden. */
    autoSearches: { type: Boolean, default: true },
    /** Responder automáticamente sólo en este horario (hora de Argentina). Fuera de él, queda para confirmar. */
    schedule: {
      enabled: { type: Boolean, default: false },
      from: { type: String, default: "09:00" },
      to: { type: String, default: "20:00" },
    },
    /** Remitentes que nunca reciben respuesta (emails o dominios completos). */
    blockedSenders: { type: [String], default: [] },
  },
  { timestamps: true }
);

export type MailSettingsDoc = InferSchemaType<typeof mailSettingsSchema>;

export const MailSettings: Model<MailSettingsDoc> = models.MailSettings ?? model<MailSettingsDoc>("MailSettings", mailSettingsSchema);
