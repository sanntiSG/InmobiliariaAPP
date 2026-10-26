import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { Mailbox } from "@/lib/db/models/Mailbox";
import { mailAccess, sendEnabled } from "@/lib/mail/access";
import { getOverview } from "@/lib/mail/overview";
import { processOutbox } from "@/lib/mail/outbox";
import { pollMailbox } from "@/lib/mail/pipeline";
import { secretBox } from "@/lib/security/secret-box";
import { rateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };
/** Se corta la lectura a los 8 s: las funciones de Netlify duran ~10 s. */
const BUDGET_MS = 8000;

/** "Revisar ahora": mira el buzón en el momento (además de la revisión programada). Una por minuto y veinte por día por inmobiliaria. */
export async function POST(req: NextRequest) {
  const a = await mailAccess(req);
  if (a instanceof NextResponse) return a;
  if (!secretBox.ready()) return NextResponse.json({ error: "El correo todavía no está habilitado en este servidor." }, { status: 503, headers: NO_STORE });

  const minute = await rateLimit(`mail-poll:min:${a.agencyId}`, 1, 60, { failOpen: false });
  if (!minute.ok) return NextResponse.json({ error: "Ya revisé hace un momento. Esperá un minuto." }, { status: 429, headers: NO_STORE });
  const day = await rateLimit(`mail-poll:day:${a.agencyId}`, 20, 24 * 60 * 60, { failOpen: false });
  if (!day.ok) return NextResponse.json({ error: "Llegaste al máximo de revisiones manuales de hoy. La revisión automática sigue funcionando." }, { status: 429, headers: NO_STORE });

  try {
    await connectDB();
    const mailbox = await Mailbox.findOne({ agencyId: a.agencyId }).select("_id").lean();
    if (!mailbox) return NextResponse.json({ error: "Todavía no conectaste ninguna casilla." }, { status: 409, headers: NO_STORE });
    const deadline = Date.now() + BUDGET_MS;
    if (sendEnabled()) await processOutbox(deadline);
    const outcome = await pollMailbox(String(mailbox._id), { deadline });
    // Lo que salió solo en esta revisión se envía ahora mismo.
    if (outcome.queued > 0 && sendEnabled()) await processOutbox(deadline);
    return NextResponse.json({ outcome, overview: await getOverview(a.agencyId, a.canManage, a.isAdmin) }, { headers: NO_STORE });
  } catch (err) {
    console.error("POST /api/dashboard/mail/poll failed:", (err as Error)?.message);
    return NextResponse.json({ error: "No se pudo revisar el correo ahora." }, { status: 503, headers: NO_STORE });
  }
}
