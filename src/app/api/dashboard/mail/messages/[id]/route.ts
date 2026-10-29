import { NextResponse, after, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db/connect";
import { MailMessage } from "@/lib/db/models/MailMessage";
import { saveLesson } from "@/lib/agents/lessons";
import { INQUIRY_CATEGORIES } from "@/lib/mail/constants";
import { mailAccess, sendEnabled } from "@/lib/mail/access";
import { noteAdminView } from "@/lib/mail/audit";
import { messageDetail } from "@/lib/mail/messages";
import { cleanFollowUp, FOLLOWUP_LIMITS } from "@/lib/mail/followup";
import { sendFollowUp, sendQueued } from "@/lib/mail/outbox";
import { rescueIgnored } from "@/lib/mail/rescue";
import { loadSettings, saveSettings } from "@/lib/mail/settings";
import { limitOr429 } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };
type Ctx = { params: Promise<{ id: string }> };

/** El detalle de un mail: el texto, por qué se lo clasificó así, el borrador y las propiedades que cita. */
export async function GET(req: NextRequest, { params }: Ctx) {
  const a = await mailAccess(req);
  if (a instanceof NextResponse) return a;
  const { id } = await params;
  try {
    const detail = await messageDetail(a.agencyId, id);
    if (!detail) return NextResponse.json({ error: "No encontré ese mail." }, { status: 404, headers: NO_STORE });
    after(() => noteAdminView(a));
    return NextResponse.json(detail, { headers: NO_STORE });
  } catch (err) {
    console.error("GET /api/dashboard/mail/messages/[id] failed:", (err as Error)?.message);
    return NextResponse.json({ error: "No se pudo cargar el mail." }, { status: 503, headers: NO_STORE });
  }
}

/** Una sola línea: sin saltos ni caracteres de control (el asunto va a un encabezado del mail). */
const oneLine = z
  .string()
  .transform((s) => s.replace(/[\r\n\t]+/g, " ").replace(/[\u0000-\u001F\u007F]/g, "").trim())
  .pipe(z.string().min(1).max(200));

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm"), subject: oneLine.optional(), body: z.string().min(1).max(6000).optional() }),
  z.object({ action: z.literal("discard") }),
  z.object({ action: z.literal("not_inquiry") }),
  z.object({ action: z.literal("was_inquiry") }),
  z.object({ action: z.literal("retry") }),
  // Contestar la duda que quedó pendiente (sale por el mismo hilo) o darla por resuelta (se habló por otro medio).
  z.object({ action: z.literal("followup"), body: z.string().min(FOLLOWUP_LIMITS.minChars).max(FOLLOWUP_LIMITS.maxChars) }),
  z.object({ action: z.literal("resolve") }),
  // "No era precio, era visita": se corrige el tema y el agente lo tiene en cuenta en mails dudosos parecidos.
  z.object({ action: z.literal("set_topic"), topic: z.enum(["availability", "price", "features", "visit", "general"]) }),
]);

/** Cuántas veces una persona marcó "no es una consulta" a un mismo remitente para que se bloquee solo. */
const BLOCK_AFTER_MARKS = 2;

/** Atiende un mail: confirmar la respuesta (con cambios si hace falta), descartarla, decir que no es una consulta o reintentar un envío fallido. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const a = await mailAccess(req);
  if (a instanceof NextResponse) return a;
  const limited = await limitOr429(req, "mail-action", 120, 60 * 60, { userId: a.userId });
  if (limited) return limited;
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "No encontré ese mail." }, { status: 404, headers: NO_STORE });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Los datos no son válidos." }, { status: 400, headers: NO_STORE });
  const input = parsed.data;

  try {
    await connectDB();
    const scope = { _id: id, agencyId: a.agencyId };
    const current = await MailMessage.findOne(scope).select("status draft from subject text").lean();
    if (!current) return NextResponse.json({ error: "No encontré ese mail." }, { status: 404, headers: NO_STORE });
    const conflict = () => NextResponse.json({ error: "Este mail ya fue atendido (quizás por otra persona). Actualizá la lista." }, { status: 409, headers: NO_STORE });

    if (input.action === "confirm") {
      const subject = input.subject ?? current.draft?.subject ?? "";
      const body = input.body ?? current.draft?.body ?? "";
      if (!subject || !body) return NextResponse.json({ error: "La respuesta no puede estar vacía." }, { status: 400, headers: NO_STORE });
      const edited = subject !== (current.draft?.subject ?? "") || body !== (current.draft?.body ?? "");
      // Atómico: si dos personas confirman a la vez, sólo una pasa.
      const moved = await MailMessage.findOneAndUpdate(
        { ...scope, status: "awaiting_confirmation" },
        { $set: { status: "queued", draft: { subject, body }, edited, decidedBy: a.userId, auto: false } },
        { returnDocument: "after" }
      ).select("_id");
      if (!moved) return conflict();
      // Si la persona cambió el texto (escribió ella la respuesta, por ejemplo la duda pendiente), ya no queda nada por contestar;
      // si lo envió tal cual, la duda sigue pendiente hasta que la conteste o la marque resuelta.
      if (edited) {
        await MailMessage.updateOne({ ...scope, humanState: "pending" }, { $set: { humanState: "resolved", humanResolvedAt: new Date(), humanResolvedBy: a.userId } });
        // Las preguntas cuyo dato no estaba cargado las contestó la persona a mano: quedan como respondidas por el equipo.
        await MailMessage.updateOne(scope, { $set: { "asks.$[m].state": "human" } }, { arrayFilters: [{ "m.state": "missing" }] });
      }
      // Donde se puede enviar, sale en el momento; si no, queda en cola y la manda el servidor que sí puede.
      const result = sendEnabled() ? await sendQueued(id) : { ok: false, status: "queued" as const };
      return NextResponse.json({ ok: true, status: result.status, error: "error" in result ? (result.error ?? null) : null }, { headers: NO_STORE });
    }

    // "Era una consulta": se vuelve a entender el mail ignorado (si hay texto guardado) y pasa a "Para confirmar".
    if (input.action === "was_inquiry") {
      const r = await rescueIgnored(a.agencyId, id, a.userId);
      if (r.ok) return NextResponse.json({ ok: true, status: "awaiting_confirmation" }, { headers: NO_STORE });
      if (r.reason === "no_text") return NextResponse.json({ error: "De este mail no guardé el texto (era automático o llegó antes de esta mejora)." }, { status: 400, headers: NO_STORE });
      return conflict();
    }

    if (input.action === "retry") {
      const moved = await MailMessage.findOneAndUpdate({ ...scope, status: "failed" }, { $set: { status: "queued", decidedBy: a.userId }, $unset: { error: "" } }, { returnDocument: "after" }).select("_id");
      if (!moved) return conflict();
      const result = sendEnabled() ? await sendQueued(id) : { ok: false, status: "queued" as const };
      return NextResponse.json({ ok: true, status: result.status, error: "error" in result ? (result.error ?? null) : null }, { headers: NO_STORE });
    }

    if (input.action === "discard") {
      // Descartar la respuesta cierra también la duda: la persona decidió no contestar.
      const moved = await MailMessage.findOneAndUpdate({ ...scope, status: "awaiting_confirmation" }, { $set: { status: "discarded", decidedBy: a.userId, humanState: "resolved", humanResolvedAt: new Date(), humanResolvedBy: a.userId } }, { returnDocument: "after" }).select("_id");
      return moved ? NextResponse.json({ ok: true, status: "discarded" }, { headers: NO_STORE }) : conflict();
    }

    // Contestar la duda pendiente: sólo a un mail que ya se respondió (si todavía espera confirmación, se edita su borrador).
    if (input.action === "followup") {
      const text = cleanFollowUp(input.body);
      if (text.length < FOLLOWUP_LIMITS.minChars) return NextResponse.json({ error: "La respuesta no puede estar vacía." }, { status: 400, headers: NO_STORE });
      const added = await MailMessage.findOneAndUpdate(
        { ...scope, status: "sent", [`followUps.${FOLLOWUP_LIMITS.max - 1}`]: { $exists: false } },
        { $push: { followUps: { body: text, by: a.userId, status: "queued" } } },
        { returnDocument: "after" }
      ).select("followUps");
      if (!added) return NextResponse.json({ error: "Sólo se puede contestar un mail que ya se respondió (y hasta 10 veces). Actualizá la lista." }, { status: 409, headers: NO_STORE });
      const sent = added.followUps[added.followUps.length - 1]!;
      // Donde se puede enviar, sale en el momento; si no, queda en cola y la manda el servidor que sí puede.
      const result = sendEnabled() ? await sendFollowUp(id, String(sent._id)) : { ok: false, status: "queued" as const };
      return NextResponse.json({ ok: true, status: result.status, error: "error" in result ? (result.error ?? null) : null }, { headers: NO_STORE });
    }

    // Corregir el tema de una consulta: se guarda en el mail y como lección (sólo las raíces de las palabras) para esta inmobiliaria.
    if (input.action === "set_topic") {
      const msg = await MailMessage.findOne(scope).select("category topics subject text").lean();
      if (!msg || !INQUIRY_CATEGORIES.includes(msg.category)) return NextResponse.json({ error: "Sólo se puede corregir el tema de una consulta." }, { status: 400, headers: NO_STORE });
      const topics = [input.topic, ...(msg.topics ?? []).filter((t) => t !== input.topic)].slice(0, 5);
      await MailMessage.updateOne(scope, { $set: { category: input.topic, topics, correctedTopic: input.topic } });
      let learned = false;
      try {
        const r = await saveLesson({ agent: "mail", target: `topic:${input.topic}`, text: `${msg.subject ?? ""}\n${msg.text ?? ""}`, source: "mail_topic", agencyId: a.agencyId, userId: a.userId });
        learned = r.ok;
      } catch (err) {
        console.error("set_topic: no se pudo guardar la lección:", (err as Error)?.message);
      }
      return NextResponse.json({ ok: true, topic: input.topic, learned }, { headers: NO_STORE });
    }

    if (input.action === "resolve") {
      const moved = await MailMessage.findOneAndUpdate({ ...scope, humanState: "pending" }, { $set: { humanState: "resolved", humanResolvedAt: new Date(), humanResolvedBy: a.userId } }, { returnDocument: "after" }).select("_id");
      return moved ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : conflict();
    }

    // "No es una consulta": se ignora y, si pasa dos veces con la misma persona, se bloquea para no volver a molestar.
    const moved = await MailMessage.findOneAndUpdate(
      { ...scope, status: "awaiting_confirmation" },
      { $set: { status: "ignored", category: "other", decidedBy: a.userId, needsHuman: false, humanState: "none", text: "" }, $push: { reasons: "Una persona del equipo marcó que no es una consulta." }, $unset: { draft: "" } },
      { returnDocument: "after" }
    ).select("_id");
    if (!moved) return conflict();
    // Una persona dijo "no es una consulta": el agente aprende a descartar mails parecidos de ESTA inmobiliaria (se guardan las
    // raíces de las palabras, no el texto; el texto del mail se borra arriba). Nunca rompe la acción.
    try {
      await saveLesson({ agent: "mail", target: "not_inquiry", text: `${current.subject ?? ""}
${current.text ?? ""}`, source: "mail_dismiss", agencyId: a.agencyId, userId: a.userId });
    } catch (err) {
      console.error("not_inquiry: no se pudo guardar la lección:", (err as Error)?.message);
    }
    const sender = current.from?.email;
    let blocked = false;
    if (sender && a.canManage) {
      const marks = await MailMessage.countDocuments({ agencyId: a.agencyId, "from.email": sender, status: "ignored", decidedBy: { $ne: null } });
      if (marks >= BLOCK_AFTER_MARKS) {
        const settings = await loadSettings(a.agencyId);
        if (!settings.blockedSenders.includes(sender)) await saveSettings(a.agencyId, { blockedSenders: [...settings.blockedSenders, sender].slice(-50) });
        blocked = true;
      }
    }
    return NextResponse.json({ ok: true, status: "ignored", blocked }, { headers: NO_STORE });
  } catch (err) {
    console.error("POST /api/dashboard/mail/messages/[id] failed:", (err as Error)?.message);
    return NextResponse.json({ error: "No se pudo completar la acción." }, { status: 503, headers: NO_STORE });
  }
}
