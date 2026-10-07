import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { agencyInputSchema } from "@/lib/validation/agency";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { deleteAgencyCascade } from "@/lib/admin/delete-agency";

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
    // Borrado en cascada: propiedades, fotos, clientes, seguidores, permisos y las
    // cuentas completas del equipo (ver lib/admin/delete-agency.ts).
    const summary = await deleteAgencyCascade(id);
    if (!summary) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("DELETE /api/admin/agencies/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo eliminar la inmobiliaria." }, { status: 503 });
  }
}
