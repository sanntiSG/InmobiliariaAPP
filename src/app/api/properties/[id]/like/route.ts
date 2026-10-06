import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { Property } from "@/lib/db/models/Property";
import { Like } from "@/lib/db/models/Like";
import { recordEvent } from "@/lib/tracking/record";
import { requireUser } from "@/lib/auth/require-user";
import { limitOr429 } from "@/lib/security/rate-limit";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });

  // Un mismo usuario no puede disparar cientos de interacciones por minuto (inflar métricas / saturar la base).
  const limited = await limitOr429(req, "social", 60, 60, { userId: user.id });
  if (limited) return limited;

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  try {
    await connectDB();
    const property = await Property.findById(id).select("agencyId status");
    if (!property || property.status !== "published") {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    const existing = await Like.findOne({ userId: user.id, propertyId: id });
    const liked = !existing;

    if (existing) {
      await existing.deleteOne();
    } else {
      await Like.create({ userId: user.id, propertyId: id });
    }

    // $inc atómico — un read-modify-write acá podía perder una actualización
    // si dos likes llegaban casi al mismo tiempo (el resto de los
    // contadores, comentarios y vistas, ya lo hacían así).
    const updated = await Property.findByIdAndUpdate(
      id,
      { $inc: { "stats.likes": liked ? 1 : -1 } },
      { new: true }
    ).select("stats.likes");

    await recordEvent({
      type: liked ? "like" : "unlike",
      userId: user.id,
      propertyId: id,
      agencyId: property.agencyId,
    });

    return NextResponse.json({ liked, likes: updated?.stats?.likes ?? 0 });
  } catch (err) {
    console.error("POST /api/properties/[id]/like failed:", err);
    return NextResponse.json({ error: "No se pudo procesar el like." }, { status: 503 });
  }
}
