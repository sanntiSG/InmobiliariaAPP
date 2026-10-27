import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db/connect";
import { AvailabilityWatch } from "@/lib/db/models/AvailabilityWatch";
import { Property } from "@/lib/db/models/Property";
import { isRentalOperation } from "@/config/pricing";
import { rentalStatus } from "@/lib/availability";
import { requireUser } from "@/lib/auth/require-user";
import { limitOr429 } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const bodySchema = z.object({ watching: z.boolean() });

/**
 * "Avisarme cuando se libere": activa o desactiva el aviso de un alquiler (uno por persona y propiedad). Sólo con cuenta. Es
 * idempotente: pedir lo mismo dos veces deja el mismo resultado.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Necesitás iniciar sesión para pedir el aviso." }, { status: 401, headers: NO_STORE });

  const limited = await limitOr429(req, "social", 60, 60, { userId: user.id });
  if (limited) return limited;

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400, headers: NO_STORE });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Los datos no son válidos." }, { status: 400, headers: NO_STORE });

  try {
    await connectDB();
    const property = await Property.findById(id).select("status operation availability").lean();
    if (!property || property.status !== "published" || !isRentalOperation(property.operation)) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404, headers: NO_STORE });
    }

    if (!parsed.data.watching) {
      await AvailabilityWatch.deleteOne({ userId: user.id, propertyId: id });
      return NextResponse.json({ watching: false }, { headers: NO_STORE });
    }

    // Si ya está disponible no hay nada que esperar: se le dice, en vez de dejar un aviso que nunca va a llegar.
    const status = rentalStatus({ state: property.availability?.state, blocked: (property.availability?.blocked ?? []).map((b) => ({ from: b.from, to: b.to })) });
    if (status.state === "available") {
      return NextResponse.json({ error: "Esta propiedad ya está disponible.", watching: false }, { status: 409, headers: NO_STORE });
    }
    await AvailabilityWatch.updateOne({ userId: user.id, propertyId: id }, { $setOnInsert: { userId: user.id, propertyId: id } }, { upsert: true });
    return NextResponse.json({ watching: true }, { headers: NO_STORE });
  } catch (err) {
    console.error("POST /api/properties/[id]/availability-watch failed:", (err as Error)?.message);
    return NextResponse.json({ error: "No se pudo guardar el aviso." }, { status: 503, headers: NO_STORE });
  }
}
