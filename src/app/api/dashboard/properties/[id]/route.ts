import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { propertyInputSchema } from "@/lib/validation/property";
import { requireAgencyUser } from "@/lib/auth/require-agency-user";
import { connectDB } from "@/lib/db/connect";
import { Property } from "@/lib/db/models/Property";

const updateSchema = propertyInputSchema.omit({ agencyId: true });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const agencyUser = await requireAgencyUser();
  if (!agencyUser) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    await connectDB();
    const property = await Property.findOne({ _id: id, agencyId: agencyUser.agencyId });
    if (!property) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

    const data = parsed.data;
    const priceChanged =
      data.price.amount !== property.price?.amount || data.price.currency !== property.price?.currency;

    property.set({ ...data, location: { type: "Point", coordinates: data.location } });

    if (priceChanged) {
      property.priceHistory?.push({ amount: data.price.amount, currency: data.price.currency, changedAt: new Date() });
    }
    if (data.status === "published" && !property.publishedAt) {
      property.publishedAt = new Date();
    }
    await property.save();

    return NextResponse.json({ id: String(property._id), slug: property.slug });
  } catch (err) {
    console.error("PATCH /api/dashboard/properties/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo actualizar la propiedad." }, { status: 503 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const agencyUser = await requireAgencyUser();
  if (!agencyUser) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  try {
    await connectDB();
    const result = await Property.deleteOne({ _id: id, agencyId: agencyUser.agencyId });
    if (result.deletedCount === 0) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/dashboard/properties/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo eliminar la propiedad." }, { status: 503 });
  }
}
