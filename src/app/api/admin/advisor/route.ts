import { NextResponse } from "next/server";
import { z } from "zod";
import { NO_STORE, adminGuard, saveDraft } from "@/lib/advisor/admin";
import { getAdminConfigState } from "@/lib/advisor/config";

export const dynamic = "force-dynamic";

/** Estado completo del estudio: borrador, publicado, biblioteca de modelos. */
export async function GET(req: Request) {
  const guard = await adminGuard(req);
  if (guard instanceof NextResponse) return guard;
  try {
    return NextResponse.json(await getAdminConfigState(), { headers: NO_STORE });
  } catch (err) {
    console.error("GET /api/admin/advisor failed:", err);
    return NextResponse.json({ error: "No se pudo cargar la configuración." }, { status: 503, headers: NO_STORE });
  }
}

const bodySchema = z.object({ draft: z.record(z.string(), z.unknown()) });

/** Guarda el BORRADOR (lo publicado no cambia hasta "Publicar"). */
export async function PATCH(req: Request) {
  const guard = await adminGuard(req);
  if (guard instanceof NextResponse) return guard;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400, headers: NO_STORE });
  try {
    return NextResponse.json(await saveDraft(parsed.data.draft, guard.userId), { headers: NO_STORE });
  } catch (err) {
    console.error("PATCH /api/admin/advisor failed:", err);
    return NextResponse.json({ error: "No se pudo guardar." }, { status: 503, headers: NO_STORE });
  }
}
