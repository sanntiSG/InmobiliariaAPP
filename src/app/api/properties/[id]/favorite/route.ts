import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { Property } from "@/lib/db/models/Property";
import { Favorite } from "@/lib/db/models/Favorite";
import { Interaction } from "@/lib/db/models/Interaction";
import { requireUser } from "@/lib/auth/require-user";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  try {
    await connectDB();
    const property = await Property.findById(id).select("agencyId status");
    if (!property || property.status !== "published") {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    const existing = await Favorite.findOne({ userId: user.id, propertyId: id });
    const favorited = !existing;

    if (existing) {
      await existing.deleteOne();
    } else {
      await Favorite.create({ userId: user.id, propertyId: id });
    }

    // $inc atómico — mismo motivo que en /like: un read-modify-write podía
    // perder una actualización con dos requests casi simultáneos.
    const updated = await Property.findByIdAndUpdate(
      id,
      { $inc: { "stats.saves": favorited ? 1 : -1 } },
      { new: true }
    ).select("stats.saves");

    await Interaction.create({
      type: favorited ? "save" : "unsave",
      userId: user.id,
      propertyId: id,
      agencyId: property.agencyId,
    });

    return NextResponse.json({ favorited, saves: updated?.stats?.saves ?? 0 });
  } catch (err) {
    console.error("POST /api/properties/[id]/favorite failed:", err);
    return NextResponse.json({ error: "No se pudo procesar el favorito." }, { status: 503 });
  }
}
