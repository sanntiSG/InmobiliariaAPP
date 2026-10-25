import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { mailAccess } from "@/lib/mail/access";
import { PREVIEW_LIMITS, previewMail, sampleFor } from "@/lib/mail/preview";
import { limitOr429 } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const bodySchema = z.object({
  subject: z.string().max(PREVIEW_LIMITS.subject).default(""),
  text: z.string().trim().min(3, "Escribí una consulta para probar.").max(PREVIEW_LIMITS.text),
  fromName: z.string().max(PREVIEW_LIMITS.name).optional(),
});

/** Una consulta de ejemplo armada con una propiedad publicada de la inmobiliaria (o `sample: null` si todavía no tiene ninguna). */
export async function GET(req: NextRequest) {
  const a = await mailAccess(req);
  if (a instanceof NextResponse) return a;
  try {
    return NextResponse.json({ sample: await sampleFor(a.agencyId) }, { headers: NO_STORE });
  } catch (err) {
    console.error("GET /api/dashboard/mail/preview failed:", (err as Error)?.message);
    return NextResponse.json({ error: "No se pudo armar el ejemplo." }, { status: 503, headers: NO_STORE });
  }
}

/**
 * "Probá cómo respondería": entiende una consulta de ejemplo con el catálogo y la configuración de la inmobiliaria y devuelve
 * qué entendió y qué respondería. No necesita casilla ni clave, y no guarda, anota, avisa ni envía nada.
 */
export async function POST(req: NextRequest) {
  const a = await mailAccess(req);
  if (a instanceof NextResponse) return a;
  const limited = await limitOr429(req, "mail-preview", 30, 60 * 60, { userId: a.userId });
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Revisá el texto." }, { status: 400, headers: NO_STORE });
  try {
    return NextResponse.json(await previewMail(a.agencyId, parsed.data), { headers: NO_STORE });
  } catch (err) {
    console.error("POST /api/dashboard/mail/preview failed:", (err as Error)?.message);
    return NextResponse.json({ error: "No se pudo probar ahora. Probá de nuevo." }, { status: 503, headers: NO_STORE });
  }
}
