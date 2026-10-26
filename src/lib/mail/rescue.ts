/**
 * "Era una consulta": una persona del equipo marca que un mail que el agente ignoró sí era una consulta. Se vuelve a analizar
 * el texto guardado (sólo se guarda el de lo que escribió una persona) forzando "consulta", se arma el borrador con las
 * propiedades de la inmobiliaria, se anota el cliente y el mail pasa a "Para confirmar". Nunca se envía solo.
 */
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { Mailbox } from "@/lib/db/models/Mailbox";
import { MailMessage } from "@/lib/db/models/MailMessage";
import { saveLesson } from "@/lib/agents/lessons";
import { analyzeMail } from "./analyze";
import { MAIL_LIMITS } from "./constants";
import { recordLead } from "./pipeline";
import { loadSettings } from "./settings";

export type RescueResult = { ok: true } | { ok: false; reason: "not_found" | "no_text" | "no_mailbox" };

export async function rescueIgnored(agencyId: string, messageId: string, userId: string): Promise<RescueResult> {
  if (!Types.ObjectId.isValid(messageId)) return { ok: false, reason: "not_found" };
  await connectDB();
  const msg = await MailMessage.findOne({ _id: messageId, agencyId, status: "ignored" }).select("mailboxId from replyTo subject text messageId").lean();
  if (!msg) return { ok: false, reason: "not_found" };
  if (!msg.text || !msg.text.trim()) return { ok: false, reason: "no_text" };
  const mailbox = await Mailbox.findOne({ agencyId }).select("_id email").lean();
  if (!mailbox) return { ok: false, reason: "no_mailbox" };

  const [settings, agency] = await Promise.all([loadSettings(agencyId), Agency.findById(agencyId).select("name").lean()]);
  const agencyName = agency?.name ?? "la inmobiliaria";
  const analysis = await analyzeMail(
    { agencyId, agencyName, settings },
    { subject: msg.subject ?? "", text: msg.text, fromName: msg.from?.name || null, seed: msg.messageId },
    { forceInquiry: true }
  );
  const cls = analysis.classification;
  const draft = analysis.compose(false);
  const propertyIds = analysis.selection.properties.map((p) => new Types.ObjectId(p.id));

  // Atómico: si dos personas lo marcan a la vez, sólo una pasa.
  const moved = await MailMessage.findOneAndUpdate(
    { _id: messageId, agencyId, status: "ignored" },
    {
      $set: {
        status: "awaiting_confirmation",
        category: cls.category,
        confidence: cls.confidence,
        reasons: [...cls.reasons, "Una persona del equipo marcó que sí era una consulta."],
        needsHuman: cls.needsHuman,
        propertyIds,
        auto: false,
        draft: { subject: draft.subject, body: draft.body },
        decidedBy: userId,
        expiresAt: new Date(Date.now() + MAIL_LIMITS.retentionDays * 86_400_000),
      },
    },
    { returnDocument: "after" }
  ).select("_id");
  if (!moved) return { ok: false, reason: "not_found" };

  // Una persona dijo "era una consulta": el agente aprende a no descartar a ciegas mails parecidos de ESTA inmobiliaria (se
  // guardan las raíces de las palabras, no el texto; ver `agents/lessons.ts`). Nunca rompe el rescate.
  try {
    await saveLesson({ agent: "mail", target: "inquiry", text: `${msg.subject ?? ""}\n${msg.text}`, source: "mail_rescue", agencyId, userId });
  } catch (err) {
    console.error("rescueIgnored: no se pudo guardar la lección:", (err as Error)?.message);
  }

  const first = analysis.selection.properties[0];
  if (first) {
    const leadId = await recordLead(
      { agencyId, agencyName, mailboxId: String(mailbox._id), ownEmail: mailbox.email, settings },
      { propertyId: first.id, name: msg.from?.name ?? "", email: msg.replyTo || msg.from?.email || "", text: msg.text }
    );
    if (leadId) await MailMessage.updateOne({ _id: messageId }, { $set: { leadId } });
  }
  return { ok: true };
}
