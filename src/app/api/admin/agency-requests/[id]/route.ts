import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { AgencyRequest } from "@/lib/db/models/AgencyRequest";
import { AllowedEmail } from "@/lib/db/models/AllowedEmail";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { reviewAgencyRequestSchema } from "@/lib/validation/agency-request";
import { GrantAccessError, grantAgencyAccess } from "@/lib/admin/grant-agency-access";
import { createNotification } from "@/lib/notifications/create";

/** Aprobar o rechazar una solicitud de inmobiliaria (sólo admin). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const parsed = reviewAgencyRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { action, note } = parsed.data;

  try {
    await connectDB();

    // Pasa de pending a su estado final de forma atómica: dos admins (o dos
    // clics) no pueden resolver la misma solicitud dos veces.
    const request = await AgencyRequest.findOneAndUpdate(
      { _id: id, status: "pending" },
      {
        $set: {
          status: action === "approve" ? "approved" : "rejected",
          reviewedBy: admin.id,
          reviewedAt: new Date(),
          reviewNote: note ?? "",
        },
      },
      { new: true }
    );
    if (!request) {
      return NextResponse.json({ error: "La solicitud ya fue resuelta o no existe." }, { status: 404 });
    }

    if (action === "reject") {
      await createNotification({
        userId: String(request.userId),
        type: "agency_rejected",
        title: "Tu solicitud de inmobiliaria no fue aprobada",
        body: note || "Podés escribirnos por WhatsApp para conversarlo.",
        href: "/solicitar-inmobiliaria",
      });
      return NextResponse.json({ ok: true, status: "rejected" });
    }

    // Aprobar: mismo flujo que "Accesos". Si el admin ya había autorizado ese
    // email por esa vía, alcanza con dejar la solicitud como aprobada.
    try {
      await grantAgencyAccess({
        email: request.email,
        agencyId: null,
        role: "agency_owner",
        grantedByUserId: admin.id,
      });
    } catch (err) {
      const alreadyGranted = err instanceof GrantAccessError && (await AllowedEmail.exists({ email: request.email }));
      if (!alreadyGranted) {
        // Se vuelve a dejar pendiente para que el admin pueda reintentar.
        await AgencyRequest.updateOne(
          { _id: request._id },
          { $set: { status: "pending", reviewedBy: null, reviewedAt: null, reviewNote: "" } }
        );
        if (err instanceof GrantAccessError) {
          return NextResponse.json({ error: err.message }, { status: err.status });
        }
        throw err;
      }
    }

    return NextResponse.json({ ok: true, status: "approved" });
  } catch (err) {
    console.error("PATCH /api/admin/agency-requests/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo resolver la solicitud." }, { status: 503 });
  }
}
