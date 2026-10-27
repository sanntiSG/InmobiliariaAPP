import { NextResponse, type NextRequest } from "next/server";
import { mailAccess } from "@/lib/mail/access";
import { loadSignatureAgency } from "@/lib/mail/outgoing";
import { buildOutgoing } from "@/lib/mail/signature";
import { publicSiteUrl } from "@/lib/mail/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * La vista previa de la firma: un mail de ejemplo con el banner armado con los datos guardados de la inmobiliaria (los de "Mi
 * inmobiliaria"). No envía ni guarda nada. El HTML lo arma el servidor con todo escapado; igual la pantalla lo muestra dentro
 * de un marco sin scripts.
 */
export async function GET(req: NextRequest) {
  const a = await mailAccess(req);
  if (a instanceof NextResponse) return a;
  try {
    const agency = await loadSignatureAgency(a.agencyId);
    if (!agency) return NextResponse.json({ error: "No encontré la inmobiliaria." }, { status: 404, headers: NO_STORE });
    const sample = [
      "Hola Camila,",
      "Gracias por escribirnos.",
      "Sí, la casa sigue disponible. Más fotos y detalles: " + (publicSiteUrl() ?? "https://tu-sitio.com") + "/propiedades/ejemplo",
      "Si querés, coordinamos una visita.",
      "Quedamos a tu disposición.",
      `Equipo de ${agency.name}`,
    ].join("\n\n");
    // La vista previa siempre muestra el banner: sirve justamente para ver cómo queda antes de activarlo.
    const out = buildOutgoing(sample, agency, publicSiteUrl(), { banner: true });
    return NextResponse.json({ html: out.html, hasLogo: !!agency.logo }, { headers: NO_STORE });
  } catch (err) {
    console.error("GET /api/dashboard/mail/signature failed:", (err as Error)?.message);
    return NextResponse.json({ error: "No se pudo armar la vista previa." }, { status: 503, headers: NO_STORE });
  }
}
