import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { AmbientCover } from "@/lib/db/models/AmbientCover";
import { AMBIENT_COVER_ID_RE } from "@/lib/ambient/constants";
import { AMBIENT_NO_STORE, ambientError, ambientGuard } from "@/lib/ambient/guard";
import { deleteCover } from "@/lib/ambient/server";

export const dynamic = "force-dynamic";

/**
 * Quita una portada subida que todavía NO se usa en ninguna propiedad (el botón "Quitar" del formulario antes de
 * guardar, o reemplazarla por otra). Una portada en uso se quita desde la propiedad al guardar.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ coverId: string }> }) {
  const guard = await ambientGuard(req, "ambient-delete", 40);
  if (guard instanceof NextResponse) return guard;
  const { access } = guard;

  const { coverId } = await params;
  if (!AMBIENT_COVER_ID_RE.test(coverId)) return ambientError("Portada inválida.", 400);

  try {
    await connectDB();
    const cover = await AmbientCover.findOne({ coverId }).select("agencyId attachedTo").lean();
    if (!cover || (!access.isAdmin && String(cover.agencyId) !== access.agencyId)) return ambientError("No encontramos esa portada.", 404);
    if (cover.attachedTo) return ambientError("Esa portada está en uso en una propiedad.", 409);
    await deleteCover(coverId);
    return NextResponse.json({ ok: true }, { headers: AMBIENT_NO_STORE });
  } catch (err) {
    console.error("DELETE /api/dashboard/ambient/[coverId] failed:", err);
    return ambientError("No se pudo quitar la portada.", 503);
  }
}
