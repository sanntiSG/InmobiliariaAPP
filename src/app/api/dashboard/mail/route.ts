import { NextResponse, type NextRequest } from "next/server";
import { mailAccess } from "@/lib/mail/access";
import { getOverview } from "@/lib/mail/overview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Estado del agente de correo de la inmobiliaria: buzón, configuración y conteos (nunca la contraseña ni el contenido de los mails). */
export async function GET(req: NextRequest) {
  const a = await mailAccess(req);
  if (a instanceof NextResponse) return a;
  try {
    return NextResponse.json(await getOverview(a.agencyId, a.canManage, a.isAdmin), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("GET /api/dashboard/mail failed:", err);
    return NextResponse.json({ error: "No se pudo cargar el estado del correo." }, { status: 503 });
  }
}
