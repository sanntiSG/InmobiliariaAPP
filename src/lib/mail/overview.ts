/**
 * Lo que la pantalla del correo necesita saber de una inmobiliaria: si el buzón está conectado y cómo anda, la configuración
 * y cuántos mails hay en cada estado. NUNCA incluye la contraseña ni el contenido de los mails.
 */
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { Mailbox } from "@/lib/db/models/Mailbox";
import { MailMessage } from "@/lib/db/models/MailMessage";
import { secretBox } from "@/lib/security/secret-box";
import { pollerEnabled, sendEnabled } from "./access";
import type { MailboxStatus } from "./constants";
import type { MailProviderId } from "./presets";
import { loadSettings, type MailSettingsView } from "./settings";

export type MailOverview = {
  /** El servidor tiene la clave para cifrar contraseñas (sin ella no se puede conectar un buzón). */
  cryptoReady: boolean;
  /** Este despliegue puede enviar mails (donde no, las respuestas quedan en cola). */
  sendEnabled: boolean;
  pollerEnabled: boolean;
  canManage: boolean;
  mailbox: null | {
    email: string;
    provider: MailProviderId;
    status: MailboxStatus;
    lastError: string | null;
    lastPollAt: string | null;
    connectedAt: string | null;
  };
  settings: MailSettingsView;
  counts: { awaiting: number; sent: number; failed: number; ignored: number; queued: number };
};

export async function getOverview(agencyId: string, canManage: boolean): Promise<MailOverview> {
  await connectDB();
  const [mailbox, settings, grouped] = await Promise.all([
    Mailbox.findOne({ agencyId }).select("email provider status lastError lastPollAt consentAt createdAt").lean(),
    loadSettings(agencyId),
    MailMessage.aggregate<{ _id: string; n: number }>([{ $match: { agencyId: new Types.ObjectId(agencyId) } }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);
  const n = (s: string) => grouped.find((g) => g._id === s)?.n ?? 0;
  return {
    cryptoReady: secretBox.ready(),
    sendEnabled: sendEnabled(),
    pollerEnabled: pollerEnabled(),
    canManage,
    mailbox: mailbox
      ? {
          email: mailbox.email,
          provider: mailbox.provider,
          status: mailbox.status ?? "active",
          lastError: mailbox.lastError ?? null,
          lastPollAt: mailbox.lastPollAt ? new Date(mailbox.lastPollAt).toISOString() : null,
          connectedAt: (mailbox.consentAt ?? mailbox.createdAt) ? new Date((mailbox.consentAt ?? mailbox.createdAt)!).toISOString() : null,
        }
      : null,
    settings,
    counts: { awaiting: n("awaiting_confirmation"), sent: n("sent"), failed: n("failed"), ignored: n("ignored") + n("discarded"), queued: n("queued") + n("sending") },
  };
}
