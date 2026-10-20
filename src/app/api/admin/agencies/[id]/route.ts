import { NextResponse, after } from "next/server";
import { Types } from "mongoose";
import { diffAgency, snapshotAgency } from "@/lib/activity/diff";
import { logActivity, touchAgencyData } from "@/lib/activity/log";
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

    const beforeSnap = snapshotAgency(agency.toObject());
    const previousStatus = agency.status;

    agency.name = data.name;
    agency.description = data.description ?? "";
    // Campo por campo: reemplazar todo `contact` borraba el sitio web que la propia
    // inmobiliaria cargó desde "Mi inmobiliaria".
    agency.set("contact.whatsapp", data.whatsapp);
    agency.set("contact.phone", data.phone);
    agency.set("contact.email", data.email || undefined);
    agency.address = { ...agency.address, city: data.city, province: data.province, country: "Argentina" };
    agency.status = data.status;
    await agency.save();

    const agencyId = String(agency._id);
    const changes = diffAgency(beforeSnap, snapshotAgency(agency.toObject()));
    if (previousStatus !== agency.status) {
      changes.push({ field: "agency.status", before: previousStatus, after: agency.status });
    }
    touchAgencyData(agencyId);
    after(() =>
      logActivity({ agencyId, actorId: admin.id, actorRole: "admin", kind: "agency_updated", changes })
    );

    return NextResponse.json({ id: agencyId });
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
