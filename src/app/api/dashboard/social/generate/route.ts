import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { socialAccess } from "@/lib/social/access";
import { generateCurrent, getState, SocialError } from "@/lib/social/engine";
import { limitOr429 } from "@/lib/security/rate-limit";

const bodySchema = z.object({ propertyId: z.string().regex(/^[a-f0-9]{24}$/i).optional() });

/** Regenera la publicación de hoy o (modo manual) elige otra propiedad. */
export async function POST(req: NextRequest) {
  const a = await socialAccess(req);
  if (a instanceof NextResponse) return a;
  // Freno anti-abuso; el tope diario real (3) lo aplica el motor.
  const limited = await limitOr429(req, "social-generate", 60, 60 * 60, { userId: a.userId });
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  try {
    await generateCurrent({ agencyId: a.agencyId, propertyId: parsed.data.propertyId, isAdmin: a.isAdmin });
    return NextResponse.json(await getState(a.agencyId, a.isAdmin));
  } catch (err) {
    if (err instanceof SocialError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("POST /api/dashboard/social/generate failed:", err);
    return NextResponse.json({ error: "No se pudo generar la publicación." }, { status: 503 });
  }
}
