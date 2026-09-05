import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db/connect";
import { AllowedEmail } from "@/lib/db/models/AllowedEmail";
import { Agency } from "@/lib/db/models/Agency";
import { User } from "@/lib/db/models/User";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { createNotification } from "@/lib/notifications/create";

const addEmailSchema = z.object({
  email: z.email("Ingresá un email válido"),
  // Vacío = el admin sólo habilita el mail; la persona crea su inmobiliaria
  // en /publicar la primera vez que inicia sesión.
  agencyId: z.string().length(24).optional(),
  role: z.enum(["agency_owner", "agency_agent"]).default("agency_owner"),
});

/** GET — Lista todos los emails autorizados (solo admin). */
export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  await connectDB();
  const allowed = await AllowedEmail.find({})
    .sort({ createdAt: -1 })
    .populate("agencyId", "name slug")
    .lean();

  return NextResponse.json(allowed);
}

/**
 * POST — Autoriza un email a gestionar una inmobiliaria (solo admin).
 * Si `agencyId` viene vacío, el email queda habilitado sin inmobiliaria
 * asociada — el usuario la crea él mismo en /publicar.
 * Si el email ya tiene una cuenta creada, se promueve en el acto (no hace
 * falta esperar a que vuelva a iniciar sesión).
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = addEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const { agencyId, role } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  try {
    await connectDB();

    if (agencyId) {
      if (!Types.ObjectId.isValid(agencyId)) {
        return NextResponse.json({ error: "Inmobiliaria inválida." }, { status: 400 });
      }
      const agencyExists = await Agency.exists({ _id: agencyId });
      if (!agencyExists) {
        return NextResponse.json({ error: "Inmobiliaria no encontrada." }, { status: 404 });
      }
    }

    const existingGrant = await AllowedEmail.findOne({ email }).lean();
    if (existingGrant) {
      return NextResponse.json({ error: "Ese email ya está autorizado." }, { status: 409 });
    }

    const existingUser = await User.findOne({ email }).select("_id role agencyId").lean();
    // No pisar al admin de la plataforma si por error se intenta autorizar su email.
    if (existingUser?.role === "admin") {
      return NextResponse.json({ error: "Ese email ya es admin de la plataforma." }, { status: 409 });
    }

    const status = !existingUser ? "pending" : agencyId ? "active" : "awaiting_agency";

    const record = await AllowedEmail.create({
      email,
      agencyId: agencyId ?? null,
      role,
      grantedBy: admin.id,
      status,
    });

    if (existingUser) {
      await User.updateOne(
        { _id: existingUser._id },
        { $set: { role, agencyId: agencyId ?? null } }
      );
      if (agencyId) {
        await Agency.updateOne({ _id: agencyId }, { $addToSet: { owners: existingUser._id } });
      }
      await createNotification({
        userId: String(existingUser._id),
        type: "system",
        title: agencyId ? "Ya podés gestionar tu inmobiliaria" : "Ya podés publicar tu inmobiliaria",
        body: agencyId
          ? "El admin te dio acceso para administrar una inmobiliaria en la plataforma."
          : "El admin te habilitó — creá tu inmobiliaria para empezar a publicar propiedades.",
        href: agencyId ? "/dashboard" : "/publicar",
      });
    }

    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/allowed-emails failed:", err);
    return NextResponse.json({ error: "No se pudo autorizar el email." }, { status: 503 });
  }
}
