import { NextResponse, after, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db/connect";
import { MailMessage } from "@/lib/db/models/MailMessage";
import { mailAccess, sendEnabled } from "@/lib/mail/access";
import { noteAdminView } from "@/lib/mail/audit";
import { messageDetail } from "@/lib/mail/messages";
import { sendQueued } from "@/lib/mail/outbox";
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
  z.object({ action: z.literal("retry") }),
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
    const current = await MailMessage.findOne(scope).select("status draft from").lean();
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
      // Donde se puede enviar, sale en el momento; si no, queda en cola y la manda el servidor que sí puede.
      const result = sendEnabled() ? await sendQueued(id) : { ok: false, status: "queued" as const };
      return NextResponse.json({ ok: true, status: result.status, error: "error" in result ? (result.error ?? null) : null }, { headers: NO_STORE });
    }

    if (input.action === "retry") {
      const moved = await MailMessage.findOneAndUpdate({ ...scope, status: "failed" }, { $set: { status: "queued", decidedBy: a.userId }, $unset: { error: "" } }, { returnDocument: "after" }).select("_id");
      if (!moved) return conflict();
      const result = sendEnabled() ? await sendQueued(id) : { ok: false, status: "queued" as const };
      return NextResponse.json({ ok: true, status: result.status, error: "error" in result ? (result.error ?? null) : null }, { headers: NO_STORE });
    }

    if (input.action === "discard") {
      const moved = await MailMessage.findOneAndUpdate({ ...scope, status: "awaiting_confirmation" }, { $set: { status: "discarded", decidedBy: a.userId } }, { returnDocument: "after" }).select("_id");
      return moved ? NextResponse.json({ ok: true, status: "discarded" }, { headers: NO_STORE }) : conflict();
    }

    // "No es una consulta": se ignora y, si pasa dos veces con la misma persona, se bloquea para no volver a molestar.
    const moved = await MailMessage.findOneAndUpdate(
      { ...scope, status: "awaiting_confirmation" },
      { $set: { status: "ignored", category: "other", decidedBy: a.userId, needsHuman: false, text: "" }, $push: { reasons: "Una persona del equipo marcó que no es una consulta." }, $unset: { draft: "" } },
      { returnDocument: "after" }
    ).select("_id");
    if (!moved) return conflict();
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
