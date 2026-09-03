import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { Property } from "@/lib/db/models/Property";
import { Rating } from "@/lib/db/models/Rating";
import { Interaction } from "@/lib/db/models/Interaction";
import { requireUser } from "@/lib/auth/require-user";

const bodySchema = z.object({ value: z.number().int().min(1).max(5) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Puntaje inválido" }, { status: 400 });

  try {
    await connectDB();
    const property = await Property.findById(id).select("agencyId");
    if (!property) return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });

    await Rating.findOneAndUpdate(
      { userId: user.id, propertyId: id },
      { $set: { value: parsed.data.value } },
      { upsert: true }
    );

    const [agg] = await Rating.aggregate([
      { $match: { propertyId: new Types.ObjectId(id) } },
      { $group: { _id: null, avg: { $avg: "$value" }, count: { $sum: 1 } } },
    ]);
    const ratingAvg = agg ? Math.round(agg.avg * 10) / 10 : parsed.data.value;
    const ratingCount = agg?.count ?? 1;

    await Property.updateOne(
      { _id: id },
      { $set: { "stats.ratingAvg": ratingAvg, "stats.ratingCount": ratingCount } }
    );

    await Interaction.create({
      type: "rate",
      userId: user.id,
      propertyId: id,
      agencyId: property.agencyId,
      meta: { value: parsed.data.value },
    });

    return NextResponse.json({ myRating: parsed.data.value, ratingAvg, ratingCount });
  } catch (err) {
    console.error("POST /api/properties/[id]/rate failed:", err);
    return NextResponse.json({ error: "No se pudo guardar el puntaje." }, { status: 503 });
  }
}
