import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";
import { MAIL_CATEGORIES, MAIL_MESSAGE_STATUSES } from "@/lib/mail/constants";

/**
 * Un mail recibido en el buzón de una inmobiliaria y lo que el agente hizo con él: cómo lo clasificó, el borrador que
 * preparó y qué pasó después. Sólo se guarda TEXTO (sin adjuntos ni HTML) y se borra solo (60 días; 14 si se ignoró).
 * El índice único `{ mailboxId, messageId }` evita procesar dos veces el mismo mail.
 */
const mailMessageSchema = new Schema(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: "Agency", required: true, index: true },
    mailboxId: { type: Schema.Types.ObjectId, ref: "Mailbox", required: true },
    /** El `Message-ID` del mail (o uno armado con el uid si no trae). */
    messageId: { type: String, required: true, maxlength: 400 },
    uid: { type: Number },
    from: {
      name: { type: String, maxlength: 120, default: "" },
      email: { type: String, required: true, lowercase: true, maxlength: 200 },
    },
    /** A quién se responde: el `Reply-To` si existe (los portales lo usan), si no, el remitente. */
    replyTo: { type: String, lowercase: true, maxlength: 200 },
    subject: { type: String, maxlength: 300, default: "" },
    /** Texto del mail, ya sin citas, firmas ni avisos legales. */
    text: { type: String, maxlength: 9000, default: "" },
    receivedAt: { type: Date, default: Date.now },
    /** Referencias del hilo (para responder en la misma conversación). */
    inReplyTo: { type: String, maxlength: 400 },
    references: { type: [String], default: [] },

    category: { type: String, enum: MAIL_CATEGORIES, required: true },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
    /** Por qué lo clasificó así, en palabras (se muestra en pantalla). */
    reasons: { type: [String], default: [] },
    /** Hay algo que el agente no puede contestar solo (financiación, mascotas, permuta…): lo ve una persona. */
    needsHuman: { type: Boolean, default: false },
    /** El servidor del remitente no pasó las verificaciones (SPF/DKIM/DMARC): nunca se responde solo. */
    authFailed: { type: Boolean, default: false },
    propertyIds: [{ type: Schema.Types.ObjectId, ref: "Property" }],
    leadId: { type: Schema.Types.ObjectId, ref: "Lead" },

    status: { type: String, enum: MAIL_MESSAGE_STATUSES, required: true, index: true },
    draft: {
      subject: { type: String, maxlength: 300 },
      body: { type: String, maxlength: 6000 },
    },
    edited: { type: Boolean, default: false },
    /** Se envió sola (modo automático) o la confirmó una persona. */
    auto: { type: Boolean, default: false },
    decidedBy: { type: Schema.Types.ObjectId, ref: "User" },
    sentAt: { type: Date },
    sendingAt: { type: Date },
    attempts: { type: Number, default: 0 },
    error: { type: String, maxlength: 300 },
    /** Cuándo se borra el mail de la base. */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

mailMessageSchema.index({ mailboxId: 1, messageId: 1 }, { unique: true });
mailMessageSchema.index({ agencyId: 1, status: 1, receivedAt: -1 });
mailMessageSchema.index({ agencyId: 1, "from.email": 1, receivedAt: -1 });
mailMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type MailMessageDoc = InferSchemaType<typeof mailMessageSchema>;

export const MailMessage: Model<MailMessageDoc> = models.MailMessage ?? model<MailMessageDoc>("MailMessage", mailMessageSchema);
