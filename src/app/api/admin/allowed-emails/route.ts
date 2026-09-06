import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db/connect";
import { AllowedEmail } from "@/lib/db/models/AllowedEmail";
import { Agency } from "@/lib/db/models/Agency";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { grantAgencyAccess, GrantAccessError } from "@/lib/admin/grant-agency-access";

const addEmailSchema = z.object({
  email: z.email("Ingresá un email válido"),
  // Vacío = el admin sólo habilita el mail; la persona crea su inmobiliaria
  // en /publicar la primera vez que inicia sesión.
  agencyId: z.string().length(24).optional(),
  role: z.enum(["agency_owner", "agency_agent"]).default("agency_owner"),
});

/**
 * GET — Lista los emails autorizados (solo admin).
 * `?agencyId=<id>` filtra a los de una sola inmobiliaria — lo usa el panel
 * "Accesos de esta inmobiliaria" en /admin/inmobiliarias/[id]/editar.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const agencyId = req.nextUrl.searchParams.get("agencyId");
  if (agencyId && !Types.ObjectId.isValid(agencyId)) {
    return NextResponse.json({ error: "Inmobiliaria inválida." }, { status: 400 });
  }

  await connectDB();
  const allowed = await AllowedEmail.find(agencyId ? { agencyId } : {})
    .sort({ createdAt: -1 })
    .populate("agencyId", "name slug")
    .lean();

  return NextResponse.json(allowed);
}

/**
 * POST — Autoriza un email a gestionar una inmobiliaria (solo admin).
 * Si `agencyId` viene vacío, el email queda habilitado sin inmobiliaria
 * asociada — el usuario la crea él mismo en /publicar.
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

    const { allowedEmailId } = await grantAgencyAccess({
      email: parsed.data.email,
      agencyId: agencyId ?? null,
      role,
      grantedByUserId: admin.id,
    });

    return NextResponse.json({ _id: allowedEmailId }, { status: 201 });
  } catch (err) {
    if (err instanceof GrantAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/admin/allowed-emails failed:", err);
    return NextResponse.json({ error: "No se pudo autorizar el email." }, { status: 503 });
  }
}
