import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { AdvisorUnmatched } from "@/lib/db/models/AdvisorUnmatched";
import { NO_STORE, adminGuard } from "@/lib/advisor/admin";

export const dynamic = "force-dynamic";

export type UnmatchedRow = { id: string; text: string; mode: "agency" | "explorer"; kind: "unknown" | "clarify"; count: number; lastAt: string };

/** Preguntas que el asesor no entendió (anónimas, enmascaradas): lo más preguntado primero. */
export async function GET(req: Request) {
  const guard = await adminGuard(req);
  if (guard instanceof NextResponse) return guard;
  try {
    await connectDB();
    const rows = await AdvisorUnmatched.find({}).sort({ count: -1, lastAt: -1 }).limit(100).lean();
    const items: UnmatchedRow[] = rows.map((r) => ({
      id: String(r._id),
      text: r.text,
      mode: r.mode,
      kind: r.kind,
      count: r.count ?? 1,
      lastAt: new Date(r.lastAt ?? Date.now()).toISOString(),
    }));
    return NextResponse.json({ items }, { headers: NO_STORE });
  } catch (err) {
    console.error("GET /api/admin/advisor/unmatched failed:", err);
    return NextResponse.json({ error: "No se pudieron cargar." }, { status: 503, headers: NO_STORE });
  }
}

const bodySchema = z.union([z.object({ id: z.string().length(24) }), z.object({ all: z.literal(true) })]);

export async function DELETE(req: Request) {
  const guard = await adminGuard(req);
  if (guard instanceof NextResponse) return guard;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400, headers: NO_STORE });
  try {
    await connectDB();
    if ("all" in parsed.data) await AdvisorUnmatched.deleteMany({});
    else if (Types.ObjectId.isValid(parsed.data.id)) await AdvisorUnmatched.deleteOne({ _id: parsed.data.id });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (err) {
    console.error("DELETE /api/admin/advisor/unmatched failed:", err);
    return NextResponse.json({ error: "No se pudo borrar." }, { status: 503, headers: NO_STORE });
  }
}
