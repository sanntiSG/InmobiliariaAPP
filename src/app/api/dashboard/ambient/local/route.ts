import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { AmbientCover } from "@/lib/db/models/AmbientCover";
import { AMBIENT_COVER_ID_RE, AMBIENT_MAX_FILE_BYTES, ambientFolder } from "@/lib/ambient/constants";
import { ambientError, ambientGuard } from "@/lib/ambient/guard";
import { referencedFiles } from "@/lib/ambient/validate";
import type { AmbientManifest } from "@/vendor/ambient";
import { cloudinaryConfigured, getStorageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Respaldo SÓLO para desarrollo sin Cloudinary: el navegador sube cada archivo por el servidor, que lo guarda en
 * `public/uploads`. En producción (con Cloudinary) esta ruta no existe: la subida es directa y firmada.
 * El archivo tiene que estar en la lista del manifest de esa portada; la verificación de bytes la hace `/register`.
 */
export async function POST(req: Request) {
  if (cloudinaryConfigured()) return ambientError("No disponible.", 404);
  const guard = await ambientGuard(req, "ambient-local", 200);
  if (guard instanceof NextResponse) return guard;
  const { access } = guard;

  const form = await req.formData().catch(() => null);
  const coverId = form?.get("coverId");
  const name = form?.get("name");
  const file = form?.get("file");
  if (typeof coverId !== "string" || !AMBIENT_COVER_ID_RE.test(coverId) || typeof name !== "string" || !(file instanceof File)) {
    return ambientError("Datos inválidos.", 400);
  }
  if (file.size > AMBIENT_MAX_FILE_BYTES) return ambientError("El archivo es demasiado pesado.", 400);

  try {
    await connectDB();
    const cover = await AmbientCover.findOne({ coverId, status: "pending" }).lean();
    if (!cover || (!access.isAdmin && String(cover.agencyId) !== access.agencyId)) return ambientError("No encontramos esa portada.", 404);
    if (!referencedFiles(cover.manifest as AmbientManifest).some((r) => r.name === name)) return ambientError("Ese archivo no es parte de la portada.", 400);

    const provider = await getStorageProvider();
    await provider.putFolderFile({ folder: ambientFolder(String(cover.agencyId), coverId), fileName: name, buffer: Buffer.from(await file.arrayBuffer()) });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("POST /api/dashboard/ambient/local failed:", err);
    return ambientError("No se pudo guardar el archivo.", 503);
  }
}
