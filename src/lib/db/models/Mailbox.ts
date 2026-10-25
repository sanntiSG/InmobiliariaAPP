import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";
import { MAILBOX_STATUSES } from "@/lib/mail/constants";

/**
 * El buzón de correo vinculado a una inmobiliaria (uno por inmobiliaria). La contraseña de aplicación se guarda CIFRADA
 * (`secret`, AES-256-GCM atado a este buzón) y jamás sale en una consulta común (`select: false`). El cursor
 * (`uidValidity` + `lastUid`) marca hasta qué mail ya se vio: el agente sólo lee lo que llega DESPUÉS de conectar.
 */
const mailboxSchema = new Schema(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: "Agency", required: true, unique: true },
    provider: { type: String, enum: ["gmail", "yahoo", "icloud", "custom"], required: true },
    /** La dirección de correo (también es el usuario de ingreso). */
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 160 },
    imap: {
      host: { type: String, required: true, maxlength: 200 },
      port: { type: Number, required: true },
    },
    smtp: {
      host: { type: String, required: true, maxlength: 200 },
      port: { type: Number, required: true },
    },
    secret: { type: String, select: false },
    status: { type: String, enum: MAILBOX_STATUSES, default: "active", index: true },
    lastError: { type: String, maxlength: 300 },
    uidValidity: { type: String },
    lastUid: { type: Number, default: 0 },
    /** Bloqueo corto mientras una revisión está en curso (evita que dos corran a la vez sobre el mismo buzón). */
    lockedUntil: { type: Date, default: null },
    nextPollAt: { type: Date, default: null, index: true },
    lastPollAt: { type: Date, default: null },
    failCount: { type: Number, default: 0 },
    connectedBy: { type: Schema.Types.ObjectId, ref: "User" },
    /** Cuándo la persona aceptó el aviso de qué se lee y cuánto se guarda. */
    consentAt: { type: Date },
  },
  { timestamps: true }
);

export type MailboxDoc = InferSchemaType<typeof mailboxSchema>;

export const Mailbox: Model<MailboxDoc> = models.Mailbox ?? model<MailboxDoc>("Mailbox", mailboxSchema);
