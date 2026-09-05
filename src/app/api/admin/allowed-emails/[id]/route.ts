import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { AllowedEmail } from "@/lib/db/models/AllowedEmail";
import { User } from "@/lib/db/models/User";
import { Agency } from "@/lib/db/models/Agency";
import { requireAdminUser } from "@/lib/auth/require-admin";

/**
 * DELETE — Revoca el permiso de un email. Si el usuario ya se registró con
 * rol de agencia (owner o agente), revierte su rol a "user", lo saca de
 * `Agency.owners[]` y limpia su `agencyId`.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  try {
    await connectDB();

    const record = await AllowedEmail.findByIdAndDelete(id).lean();
    if (!record) {
      return NextResponse.json({ error: "Permiso no encontrado." }, { status: 404 });
    }

    const user = await User.findOneAndUpdate(
      { email: record.email, role: { $in: ["agency_owner", "agency_agent"] } },
      { $set: { role: "user", agencyId: null } }
    ).lean();

    if (user && record.agencyId) {
      await Agency.updateOne({ _id: record.agencyId }, { $pull: { owners: user._id } });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/allowed-emails/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo revocar el permiso." }, { status: 503 });
  }
}
