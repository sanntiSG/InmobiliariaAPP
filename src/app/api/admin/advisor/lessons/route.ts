import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { AdvisorUnmatched } from "@/lib/db/models/AdvisorUnmatched";
import { LESSON_AGENTS, type LessonAgent } from "@/lib/db/models/AgentLesson";
import { deleteLesson, listLessons, saveLesson, LESSON_MAX_CHARS } from "@/lib/agents/lessons";
import { NO_STORE, adminGuard } from "@/lib/advisor/admin";

export const dynamic = "force-dynamic";

/**
 * Lo que el admin le enseña a un agente. Todas las operaciones exigen admin confirmado contra la base. Las lecciones del admin
 * son globales (valen para todas las inmobiliarias); las que nacen de marcar un mail pertenecen a esa inmobiliaria y no pasan
 * por acá. El texto se enmascara y se acota al guardarlo; el objetivo se valida contra las intenciones reales del asesor.
 */

export async function GET(req: Request) {
  const guard = await adminGuard(req);
  if (guard instanceof NextResponse) return guard;
  const raw = new URL(req.url).searchParams.get("agent") ?? "advisor";
  if (!(LESSON_AGENTS as readonly string[]).includes(raw)) return NextResponse.json({ error: "Agente inválido." }, { status: 400, headers: NO_STORE });
  try {
    return NextResponse.json({ items: await listLessons(raw as LessonAgent) }, { headers: NO_STORE });
  } catch (err) {
    console.error("GET /api/admin/advisor/lessons failed:", err);
    return NextResponse.json({ error: "No se pudieron cargar." }, { status: 503, headers: NO_STORE });
  }
}

const createSchema = z.object({
  agent: z.enum(LESSON_AGENTS),
  target: z.string().min(3).max(60),
  text: z.string().trim().min(3).max(400),
  /** Si viene de una pregunta que no entendió, esa fila se borra al enseñarla. */
  unmatchedId: z.string().length(24).optional(),
});

export async function POST(req: Request) {
  const guard = await adminGuard(req);
  if (guard instanceof NextResponse) return guard;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Revisá los datos." }, { status: 400, headers: NO_STORE });
  const { agent, target, text, unmatchedId } = parsed.data;
  if (text.length > LESSON_MAX_CHARS[agent] * 2) return NextResponse.json({ error: "El texto es demasiado largo." }, { status: 400, headers: NO_STORE });
  try {
    const r = await saveLesson({ agent, target, text, source: unmatchedId ? "unmatched" : "manual", userId: guard.userId });
    if (!r.ok) {
      const error = r.reason === "bad_target" ? "Ese destino no existe." : "La frase es muy corta: escribí una frase completa.";
      return NextResponse.json({ error }, { status: 400, headers: NO_STORE });
    }
    // Ya está enseñada: esa pregunta deja de figurar como "no entendida".
    if (unmatchedId && Types.ObjectId.isValid(unmatchedId)) {
      await connectDB();
      await AdvisorUnmatched.deleteOne({ _id: unmatchedId });
    }
    return NextResponse.json({ ok: true, id: r.id, created: r.created }, { headers: NO_STORE });
  } catch (err) {
    console.error("POST /api/admin/advisor/lessons failed:", err);
    return NextResponse.json({ error: "No se pudo guardar." }, { status: 503, headers: NO_STORE });
  }
}

export async function DELETE(req: Request) {
  const guard = await adminGuard(req);
  if (guard instanceof NextResponse) return guard;
  const parsed = z.object({ id: z.string().length(24) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400, headers: NO_STORE });
  try {
    await deleteLesson(parsed.data.id);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (err) {
    console.error("DELETE /api/admin/advisor/lessons failed:", err);
    return NextResponse.json({ error: "No se pudo borrar." }, { status: 503, headers: NO_STORE });
  }
}
