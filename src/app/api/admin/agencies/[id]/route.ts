import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { agencyInputSchema } from "@/lib/validation/agency";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { Property } from "@/lib/db/models/Property";
import { User } from "@/lib/db/models/User";
import { AllowedEmail } from "@/lib/db/models/AllowedEmail";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const parsed = agencyInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;

  try {
    await connectDB();
    const agency = await Agency.findById(id);
    if (!agency) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

    agency.name = data.name;
    agency.description = data.description ?? "";
    agency.contact = { whatsapp: data.whatsapp, phone: data.phone, email: data.email || undefined };
    agency.address = { ...agency.address, city: data.city, province: data.province, country: "Argentina" };
    agency.status = data.status;
    await agency.save();

    return NextResponse.json({ id: String(agency._id) });
  } catch (err) {
    console.error("PATCH /api/admin/agencies/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo actualizar la inmobiliaria." }, { status: 503 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  try {
    await connectDB();
    const propertyCount = await Property.countDocuments({ agencyId: id });
    if (propertyCount > 0) {
      return NextResponse.json(
        { error: `Esta inmobiliaria tiene ${propertyCount} propiedad(es). Eliminalas o suspendé la inmobiliaria en vez de borrarla.` },
        { status: 409 }
      );
    }

    const result = await Agency.deleteOne({ _id: id });
    if (result.deletedCount === 0) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

    // Evitar huérfanos: los usuarios y permisos que apuntaban a esta
    // inmobiliaria pierden el acceso de agencia.
    await User.updateMany(
      { agencyId: id },
      { $set: { role: "user", agencyId: null } }
    );
    await AllowedEmail.deleteMany({ agencyId: id });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/agencies/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo eliminar la inmobiliaria." }, { status: 503 });
  }
}
