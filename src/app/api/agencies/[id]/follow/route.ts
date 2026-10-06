import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { AgencyFollow } from "@/lib/db/models/AgencyFollow";
import { requireUser } from "@/lib/auth/require-user";
import { rateLimit } from "@/lib/security/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

async function authorize(params: Ctx["params"]) {
  const user = await requireUser();
  if (!user) return { error: NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 }) } as const;

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return { error: NextResponse.json({ error: "Id inválido" }, { status: 400 }) } as const;

  const limit = await rateLimit(`follow:${user.id}`, 30, 60);
  if (!limit.ok) {
    return { error: NextResponse.json({ error: "Demasiadas acciones seguidas. Esperá un momento." }, { status: 429 }) } as const;
  }
  return { user, id } as const;
}

/** Seguir a una inmobiliaria (idempotente: seguirla dos veces no suma dos seguidores). */
export async function POST(_req: Request, { params }: Ctx) {
  const auth = await authorize(params);
  if ("error" in auth) return auth.error;

  try {
    await connectDB();
    const agency = await Agency.exists({ _id: auth.id, status: "active" });
    if (!agency) return NextResponse.json({ error: "Inmobiliaria no encontrada" }, { status: 404 });

    // upsert: sólo cuenta (+1) cuando el seguimiento se crea de verdad.
    const result = await AgencyFollow.updateOne(
      { userId: auth.user.id, agencyId: auth.id },
      { $setOnInsert: { userId: auth.user.id, agencyId: auth.id } },
      { upsert: true }
    );
    if (result.upsertedCount > 0) await Agency.updateOne({ _id: auth.id }, { $inc: { "stats.followers": 1 } });

    const updated = await Agency.findById(auth.id).select("stats.followers").lean();
    return NextResponse.json({ following: true, followers: updated?.stats?.followers ?? 0 });
  } catch (err) {
    console.error("POST /api/agencies/[id]/follow failed:", err);
    return NextResponse.json({ error: "No se pudo seguir a la inmobiliaria." }, { status: 503 });
  }
}

/** Dejar de seguir. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await authorize(params);
  if ("error" in auth) return auth.error;

  try {
    await connectDB();
    const result = await AgencyFollow.deleteOne({ userId: auth.user.id, agencyId: auth.id });
    if (result.deletedCount > 0) await Agency.updateOne({ _id: auth.id }, { $inc: { "stats.followers": -1 } });

    const updated = await Agency.findById(auth.id).select("stats.followers").lean();
    return NextResponse.json({ following: false, followers: Math.max(0, updated?.stats?.followers ?? 0) });
  } catch (err) {
    console.error("DELETE /api/agencies/[id]/follow failed:", err);
    return NextResponse.json({ error: "No se pudo dejar de seguir." }, { status: 503 });
  }
}
