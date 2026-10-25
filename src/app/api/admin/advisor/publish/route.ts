import { NextResponse } from "next/server";
import { NO_STORE, adminGuard, agentFromRequest, publishDraft } from "@/lib/advisor/admin";

export const dynamic = "force-dynamic";

/** Publica el borrador: desde ahora es lo que ve la gente. */
export async function POST(req: Request) {
  const guard = await adminGuard(req);
  if (guard instanceof NextResponse) return guard;
  const agent = agentFromRequest(req);
  if (!agent) return NextResponse.json({ error: "Agente desconocido." }, { status: 404, headers: NO_STORE });
  try {
    return NextResponse.json(await publishDraft(guard.userId, agent), { headers: NO_STORE });
  } catch (err) {
    console.error("POST /api/admin/advisor/publish failed:", err);
    return NextResponse.json({ error: "No se pudo publicar." }, { status: 503, headers: NO_STORE });
  }
}
