import { NextResponse, after, type NextRequest } from "next/server";
import { mailAccess } from "@/lib/mail/access";
import { noteAdminView } from "@/lib/mail/audit";
import { listMessages, type MailTab } from "@/lib/mail/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lista de mails por pestaña (`?tab=confirm|human|sent|ignored`). El admin sólo la ve "viendo como" una inmobiliaria, y queda anotado. */
export async function GET(req: NextRequest) {
  const a = await mailAccess(req);
  if (a instanceof NextResponse) return a;
  const raw = req.nextUrl.searchParams.get("tab");
  const tab: MailTab = raw === "sent" || raw === "ignored" || raw === "human" ? raw : "confirm";
  try {
    // La inmobiliaria puede ver (en su bitácora) que el admin entró a su correo.
    after(() => noteAdminView(a));
    return NextResponse.json({ items: await listMessages(a.agencyId, tab) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("GET /api/dashboard/mail/messages failed:", (err as Error)?.message);
    return NextResponse.json({ error: "No se pudieron cargar los mails." }, { status: 503 });
  }
}
