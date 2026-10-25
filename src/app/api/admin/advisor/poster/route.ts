import { NextResponse } from "next/server";
import { NO_STORE, adminGuard, agentFromRequest, saveDraft } from "@/lib/advisor/admin";
import { getAdminConfigState } from "@/lib/advisor/config";
import { getStorageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

const POSTER_MAX_BYTES = 2 * 1024 * 1024;

/** Sube el póster (PNG capturado del visor) y lo deja en el borrador. Es la imagen del botón flotante. */
export async function POST(req: Request) {
  const guard = await adminGuard(req);
  if (guard instanceof NextResponse) return guard;
  const agent = agentFromRequest(req);
  if (!agent) return NextResponse.json({ error: "Agente desconocido." }, { status: 404, headers: NO_STORE });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Falta la imagen." }, { status: 400, headers: NO_STORE });
  if (file.size > POSTER_MAX_BYTES) return NextResponse.json({ error: "La imagen pesa más de 2 MB." }, { status: 400, headers: NO_STORE });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    // Firma PNG: 89 50 4E 47.
    if (!(buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)) {
      return NextResponse.json({ error: "La imagen tiene que ser un PNG." }, { status: 400, headers: NO_STORE });
    }
    const provider = await getStorageProvider();
    const result = await provider.upload({ buffer, filename: "poster.png", folder: "advisor", quality: "best" });
    const state = await getAdminConfigState(agent);
    return NextResponse.json(await saveDraft({ ...state.draft, poster: result.url }, guard.userId, agent), { headers: NO_STORE });
  } catch (err) {
    console.error("POST /api/admin/advisor/poster failed:", err);
    return NextResponse.json({ error: "No se pudo subir el póster." }, { status: 503, headers: NO_STORE });
  }
}
