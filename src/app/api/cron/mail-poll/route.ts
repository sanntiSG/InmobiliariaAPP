import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { Mailbox } from "@/lib/db/models/Mailbox";
import { pollerEnabled } from "@/lib/mail/access";
import { recordMailRun } from "@/lib/mail/heartbeat";
import { processOutbox } from "@/lib/mail/outbox";
import { pollMailbox } from "@/lib/mail/pipeline";
import { rateLimit } from "@/lib/security/rate-limit";
import { verifyCronRequest } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Se corta a los 8 s: las funciones de Netlify duran ~10 s. Lo que falte lo toma la próxima llamada (`more: true`). */
const BUDGET_MS = 8000;

/**
 * Revisión programada de todos los buzones (la llama la función programada de Netlify cada 5 minutos con `Authorization:
 * Bearer <clave derivada>`, ver `netlify/functions/mail-poll.mts`). Sólo corre donde el correo está habilitado (en los demás
 * despliegues, como Render, la ruta "no existe") y sólo responde conteos: nunca contenido de mails ni direcciones.
 */
export async function POST(req: NextRequest) {
  // Fuera de los despliegues que corren la revisión, la ruta se hace pasar por inexistente.
  if (!pollerEnabled()) return new NextResponse(null, { status: 404 });
  if (!verifyCronRequest(req)) return new NextResponse(null, { status: 401 });
  const limit = await rateLimit("cron-mail", 60, 300, { failOpen: false });
  if (!limit.ok) return new NextResponse(null, { status: 429 });

  const deadline = Date.now() + BUDGET_MS;
  try {
    await connectDB();
    // Primero se envía lo que quedó en cola (confirmaciones y respuestas automáticas), después se revisa.
    const outbox = await processOutbox(deadline);
    const due = await Mailbox.find({ status: { $in: ["active", "error"] }, nextPollAt: { $lte: new Date() }, lockedUntil: { $not: { $gt: new Date() } } })
      .sort({ nextPollAt: 1 })
      .limit(10)
      .select("_id")
      .lean();

    let polled = 0;
    let drafts = 0;
    let queued = 0;
    let errors = 0;
    let more = outbox.more;
    for (let i = 0; i < due.length; i++) {
      if (Date.now() > deadline) {
        more = true;
        break;
      }
      const r = await pollMailbox(String(due[i]!._id), { deadline });
      polled++;
      drafts += r.drafts;
      queued += r.queued;
      if (r.status === "error") errors++;
      if (r.more) more = true;
    }
    if (due.length === 10) more = true;
    await recordMailRun(true, { polled, drafts, sent: outbox.sent, errors });
    return NextResponse.json({ polled, drafts, queued, errors, sent: outbox.sent, more }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("POST /api/cron/mail-poll failed:", (err as Error)?.message);
    await recordMailRun(false, { polled: 0, drafts: 0, sent: 0, errors: 1 });
    return new NextResponse(null, { status: 503 });
  }
}
