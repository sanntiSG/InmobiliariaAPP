import { NextResponse } from "next/server";
import { NO_STORE, adminGuard, agentFromRequest, discardDraft } from "@/lib/advisor/admin";

export const dynamic = "force-dynamic";

/** Descarta los cambios sin publicar: el borrador vuelve a ser igual a lo publicado. */
export async function POST(req: Request) {
  const guard = await adminGuard(req);
  if (guard instanceof NextResponse) return guard;
  const agent = agentFromRequest(req);
  if (!agent) return NextResponse.json({ error: "Agente desconocido." }, { status: 404, headers: NO_STORE });
  try {
    return NextResponse.json(await discardDraft(agent), { headers: NO_STORE });
  } catch (err) {
    console.error("POST /api/admin/advisor/discard failed:", err);
    return NextResponse.json({ error: "No se pudo descartar." }, { status: 503, headers: NO_STORE });
  }
}
