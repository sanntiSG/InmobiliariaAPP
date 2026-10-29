import { NextResponse, after, type NextRequest } from "next/server";
import { mailAccess } from "@/lib/mail/access";
import { noteAdminView } from "@/lib/mail/audit";
import { listInbox, listMessages, SUBS_BY_GROUP, tabToGroup, type MailGroup, type MailSub, type MailTab } from "@/lib/mail/messages";
import { limitOr429 } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GROUPS: readonly MailGroup[] = ["attention", "answered", "ignored"];

/**
 * La bandeja por grupo (`?group=attention|answered|ignored`, afinada con `&sub=` y una búsqueda `&q=`), con los mails de una misma
 * conversación juntos. Por compatibilidad también acepta la forma anterior (`?tab=confirm|human|sent|ignored`). El admin sólo la ve
 * "viendo como" una inmobiliaria, y queda anotado.
 */
export async function GET(req: NextRequest) {
  const a = await mailAccess(req);
  if (a instanceof NextResponse) return a;
  const limited = await limitOr429(req, "mail-list", 240, 60, { userId: a.userId });
  if (limited) return limited;

  const params = req.nextUrl.searchParams;
  const rawGroup = params.get("group");
  const rawTab = params.get("tab");
  try {
    // La inmobiliaria puede ver (en su bitácora) que el admin entró a su correo.
    after(() => noteAdminView(a));
    const headers = { "Cache-Control": "no-store" };
    if (!rawGroup && rawTab) {
      const tab: MailTab = rawTab === "sent" || rawTab === "ignored" || rawTab === "human" ? rawTab : "confirm";
      return NextResponse.json({ items: await listMessages(a.agencyId, tab) }, { headers });
    }
    const group = (GROUPS as readonly string[]).includes(rawGroup ?? "") ? (rawGroup as MailGroup) : tabToGroup("confirm").group;
    const rawSub = params.get("sub") ?? "all";
    const sub: MailSub = (SUBS_BY_GROUP[group] as readonly string[]).includes(rawSub) ? (rawSub as MailSub) : "all";
    const q = (params.get("q") ?? "").slice(0, 60);
    return NextResponse.json({ items: await listInbox(a.agencyId, { group, sub, q }) }, { headers });
  } catch (err) {
    console.error("GET /api/dashboard/mail/messages failed:", (err as Error)?.message);
    return NextResponse.json({ error: "No se pudieron cargar los mails." }, { status: 503 });
  }
}
