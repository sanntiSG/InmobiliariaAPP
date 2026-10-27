/**
 * El envío de las respuestas. Un mail pasa por estados que sólo cambian con operaciones atómicas
 * (`awaiting_confirmation → queued → sending → sent | failed`): dos pedidos al mismo tiempo, o dos servidores a la vez,
 * nunca envían dos veces. Lo que quedó en "sending" mucho tiempo (se cortó la conexión justo al enviar) NO se reintenta
 * solo —podría haber salido—: se marca "no se pudo enviar" con aviso de revisar la carpeta de enviados de la casilla.
 * Sólo donde `MAIL_SEND_ENABLED=true` se envía (Render gratis bloquea SMTP): en los demás despliegues la respuesta queda
 * "en cola" y la manda el que sí puede en su próxima pasada.
 */
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { Lead } from "@/lib/db/models/Lead";
import { Mailbox } from "@/lib/db/models/Mailbox";
import { MailMessage } from "@/lib/db/models/MailMessage";
import { createNotificationForMany } from "@/lib/notifications/create";
import { agencyMemberIds } from "@/lib/notifications/agency-members";
import { sendEnabled } from "./access";
import { replySubject } from "./compose";
import type { MailMessageStatus } from "./constants";
import { openCreds } from "./creds";
import { composeOutgoing } from "./outgoing";
import { explain, sendReply } from "./transport";

const STUCK_SENDING_MS = 10 * 60_000;

export type SendResult = { ok: boolean; status: MailMessageStatus | "missing"; error?: string };

/** Envía una respuesta que está "en cola". Idempotente: si ya no está en cola, no hace nada. */
export async function sendQueued(messageId: string): Promise<SendResult> {
  if (!Types.ObjectId.isValid(messageId)) return { ok: false, status: "missing" };
  await connectDB();
  const doc = await MailMessage.findOneAndUpdate({ _id: messageId, status: "queued" }, { $set: { status: "sending", sendingAt: new Date() }, $inc: { attempts: 1 } }, { returnDocument: "after" });
  if (!doc) {
    const current = await MailMessage.findById(messageId).select("status").lean();
    return { ok: false, status: current ? (current.status as MailMessageStatus) : "missing" };
  }

  const fail = async (error: string): Promise<SendResult> => {
    await MailMessage.updateOne({ _id: doc._id }, { $set: { status: "failed", error: error.slice(0, 300) } });
    return { ok: false, status: "failed", error };
  };

  try {
    const [mailbox, agency] = await Promise.all([
      Mailbox.findById(doc.mailboxId).select("+secret agencyId provider email imap smtp status"),
      Agency.findById(doc.agencyId).select("name").lean(),
    ]);
    if (!mailbox || mailbox.status === "paused") return await fail("El buzón ya no está conectado.");
    const creds = openCreds(mailbox);
    const to = doc.replyTo || doc.from?.email || "";
    const out = await composeOutgoing(String(doc.agencyId), doc.draft?.body ?? "");
    await sendReply(creds, {
      to,
      fromName: agency?.name ?? "Inmobiliaria",
      subject: doc.draft?.subject ?? `Re: ${doc.subject}`,
      text: out.text,
      html: out.html,
      inReplyTo: doc.messageId.startsWith("uid:") ? null : doc.messageId,
      references: [...(doc.references ?? []), ...(doc.messageId.startsWith("uid:") ? [] : [doc.messageId])],
      auto: !!doc.auto,
    });
    const now = new Date();
    await MailMessage.updateOne({ _id: doc._id }, { $set: { status: "sent", sentAt: now }, $unset: { error: "" } });

    // El cliente pasó a estar atendido: sale de "sin seguimiento".
    if (doc.leadId) {
      await Lead.updateOne({ _id: doc.leadId, status: "nuevo" }, { $set: { status: "contactado", lastContactAt: now }, $push: { history: { status: "contactado", at: now, by: doc.decidedBy ?? null } } });
      await Lead.updateOne({ _id: doc.leadId }, { $set: { lastContactAt: now } });
    }
    // Si quedó una duda para una persona, el aviso de "necesita a alguien" (que ya salió al leer el mail) cubre esta respuesta.
    if (doc.auto && doc.humanState !== "pending") {
      await createNotificationForMany(await agencyMemberIds(String(doc.agencyId)), {
        type: "mail_draft",
        title: "Se respondió una consulta automáticamente.",
        body: `${doc.from?.name || doc.from?.email || ""}: ${doc.subject}`.slice(0, 200),
        href: `/dashboard/agentes/correo?m=${doc._id}`,
        dedupeKey: `mail-sent:${doc._id}`,
      });
    }
    return { ok: true, status: "sent" };
  } catch (err) {
    return fail(explain(err).message);
  }
}

/**
 * Envía una respuesta posterior del equipo (`followUps`, por ejemplo la que contesta una duda que quedó pendiente) por el mismo
 * hilo de la conversación. Idempotente: si ya no está en cola, no hace nada. Al salir bien, la duda queda resuelta.
 */
export async function sendFollowUp(messageId: string, followUpId: string): Promise<SendResult> {
  if (!Types.ObjectId.isValid(messageId) || !Types.ObjectId.isValid(followUpId)) return { ok: false, status: "missing" };
  await connectDB();
  const claimed = await MailMessage.findOneAndUpdate(
    { _id: messageId, followUps: { $elemMatch: { _id: followUpId, status: "queued" } } },
    { $set: { "followUps.$.status": "sending", "followUps.$.sendingAt": new Date() }, $inc: { "followUps.$.attempts": 1 } },
    { returnDocument: "after" }
  );
  if (!claimed) return { ok: false, status: "missing" };
  const followUp = claimed.followUps.find((f) => String(f._id) === followUpId);
  if (!followUp) return { ok: false, status: "missing" };

  const setFollowUp = (set: Record<string, unknown>, doc: Record<string, unknown> = {}) =>
    MailMessage.updateOne({ _id: claimed._id }, { $set: { ...Object.fromEntries(Object.entries(set).map(([k, v]) => [`followUps.$[f].${k}`, v])), ...doc } }, { arrayFilters: [{ "f._id": followUp._id }] });
  const fail = async (error: string): Promise<SendResult> => {
    await setFollowUp({ status: "failed", error: error.slice(0, 300) });
    return { ok: false, status: "failed", error };
  };

  try {
    const [mailbox, agency] = await Promise.all([
      Mailbox.findById(claimed.mailboxId).select("+secret agencyId provider email imap smtp status"),
      Agency.findById(claimed.agencyId).select("name").lean(),
    ]);
    if (!mailbox || mailbox.status === "paused") return await fail("El buzón ya no está conectado.");
    const real = !claimed.messageId.startsWith("uid:");
    const out = await composeOutgoing(String(claimed.agencyId), followUp.body);
    await sendReply(openCreds(mailbox), {
      to: claimed.replyTo || claimed.from?.email || "",
      fromName: agency?.name ?? "Inmobiliaria",
      subject: replySubject(claimed.subject),
      text: out.text,
      html: out.html,
      inReplyTo: real ? claimed.messageId : null,
      references: [...(claimed.references ?? []), ...(real ? [claimed.messageId] : [])],
      auto: false,
    });
    const now = new Date();
    await setFollowUp({ status: "sent", sentAt: now }, { humanState: "resolved", humanResolvedAt: now, humanResolvedBy: followUp.by ?? null });
    await MailMessage.updateOne({ _id: claimed._id }, { $unset: { "followUps.$[f].error": "" } }, { arrayFilters: [{ "f._id": followUp._id }] });
    if (claimed.leadId) await Lead.updateOne({ _id: claimed.leadId }, { $set: { lastContactAt: now } });
    return { ok: true, status: "sent" };
  } catch (err) {
    return fail(explain(err).message);
  }
}

/**
 * Pasa por el envío de todo lo que quedó en cola (donde se puede enviar) y marca como fallido lo que quedó "enviando"
 * demasiado tiempo. Devuelve cuántos salieron y si quedan más.
 */
export async function processOutbox(deadline: number): Promise<{ sent: number; failed: number; more: boolean }> {
  await connectDB();
  const stuckBefore = new Date(Date.now() - STUCK_SENDING_MS);
  const uncertain = "No se sabe si el mail salió: revisá la carpeta de enviados de tu casilla antes de reintentar.";
  await MailMessage.updateMany({ status: "sending", sendingAt: { $lt: stuckBefore } }, { $set: { status: "failed", error: uncertain } });
  await MailMessage.updateMany(
    { followUps: { $elemMatch: { status: "sending", sendingAt: { $lt: stuckBefore } } } },
    { $set: { "followUps.$[f].status": "failed", "followUps.$[f].error": uncertain } },
    { arrayFilters: [{ "f.status": "sending", "f.sendingAt": { $lt: stuckBefore } }] }
  );
  if (!sendEnabled()) return { sent: 0, failed: 0, more: false };

  let sent = 0;
  let failed = 0;
  const queue = await MailMessage.find({ status: "queued" }).sort({ createdAt: 1 }).limit(20).select("_id").lean();
  for (let i = 0; i < queue.length; i++) {
    if (Date.now() > deadline) return { sent, failed, more: true };
    const r = await sendQueued(String(queue[i]!._id));
    if (r.ok) sent++;
    else if (r.status === "failed") failed++;
  }
  let more = queue.length === 20;

  // Las respuestas posteriores del equipo que esperan salir (si se escribieron donde no se puede enviar, las manda este servidor).
  const withFollowUps = await MailMessage.find({ "followUps.status": "queued" }).sort({ updatedAt: 1 }).limit(10).select("_id followUps").lean();
  for (const doc of withFollowUps) {
    for (const f of (doc.followUps ?? []).filter((x) => x.status === "queued")) {
      if (Date.now() > deadline) return { sent, failed, more: true };
      const r = await sendFollowUp(String(doc._id), String(f._id));
      if (r.ok) sent++;
      else if (r.status === "failed") failed++;
    }
  }
  if (withFollowUps.length === 10) more = true;
  return { sent, failed, more };
}
