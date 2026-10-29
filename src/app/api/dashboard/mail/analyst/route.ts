import { NextResponse, type NextRequest } from "next/server";
import { memo } from "@/lib/intelligence/cache";
import { mailAccess } from "@/lib/mail/access";
import { ANALYST_OPTIONS, answerAnalyst, briefing, loadAnalystData, type AnalystOption } from "@/lib/mail/analyst";
import { loadSettings } from "@/lib/mail/settings";
import { limitOr429 } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * El analista del correo (resúmenes y recomendaciones con opciones fijas, no un chat). Sin `option` devuelve sólo los titulares y las
 * opciones; con `option` también la respuesta a esa opción. Los números se calculan con agregados acotados a ESA inmobiliaria y se
 * guardan un minuto (tocar varias opciones seguidas no repite las consultas).
 */
export async function GET(req: NextRequest) {
  const a = await mailAccess(req);
  if (a instanceof NextResponse) return a;
  const limited = await limitOr429(req, "mail-analyst", 60, 60, { userId: a.userId });
  if (limited) return limited;

  const raw = req.nextUrl.searchParams.get("option");
  const option = raw && (ANALYST_OPTIONS as readonly string[]).includes(raw) ? (raw as AnalystOption) : null;
  if (raw && !option) return NextResponse.json({ error: "Opción desconocida." }, { status: 400 });

  try {
    const data = await memo(`mail-analyst:${a.agencyId}`, 60_000, async () => {
      const settings = await loadSettings(a.agencyId);
      return loadAnalystData(a.agencyId, settings.mode, 30);
    });
    return NextResponse.json({ briefing: briefing(data), answer: option ? answerAnalyst(option, data) : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("GET /api/dashboard/mail/analyst failed:", (err as Error)?.message);
    return NextResponse.json({ error: "No se pudo armar el resumen." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
