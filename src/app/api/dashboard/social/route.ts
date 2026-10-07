import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { socialAccess } from "@/lib/social/access";
import { getState, setMode, SocialError } from "@/lib/social/engine";
import { limitOr429 } from "@/lib/security/rate-limit";

/** Estado de "Contenido para redes" (avanza el día si hace falta). */
export async function GET(req: NextRequest) {
  const a = await socialAccess(req);
  if (a instanceof NextResponse) return a;
  try {
    return NextResponse.json(await getState(a.agencyId, a.isAdmin));
  } catch (err) {
    console.error("GET /api/dashboard/social failed:", err);
    return NextResponse.json({ error: "No se pudo cargar el contenido." }, { status: 503 });
  }
}

const modeSchema = z.object({ mode: z.enum(["auto", "manual"]) });

/** Cambia entre automático y manual (persistente). */
export async function PATCH(req: NextRequest) {
  const a = await socialAccess(req);
  if (a instanceof NextResponse) return a;
  const limited = await limitOr429(req, "social-mode", 30, 60 * 60, { userId: a.userId });
  if (limited) return limited;

  const parsed = modeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Modo inválido." }, { status: 400 });
  try {
    await setMode(a.agencyId, parsed.data.mode);
    return NextResponse.json(await getState(a.agencyId, a.isAdmin));
  } catch (err) {
    if (err instanceof SocialError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("PATCH /api/dashboard/social failed:", err);
    return NextResponse.json({ error: "No se pudo cambiar el modo." }, { status: 503 });
  }
}
