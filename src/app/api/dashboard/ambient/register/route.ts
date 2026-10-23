import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/connect";
import { AmbientCover } from "@/lib/db/models/AmbientCover";
import { AMBIENT_COVER_ID_RE, AMBIENT_MAX_FILE_BYTES, ambientFolder, ambientPosterFolder } from "@/lib/ambient/constants";
import { AMBIENT_NO_STORE, ambientError, ambientGuard } from "@/lib/ambient/guard";
import { deleteCover, toCoverSummary } from "@/lib/ambient/server";
import { AmbientValidationError, referencedFiles, verifyFileBytes } from "@/lib/ambient/validate";
import type { AmbientManifest } from "@/vendor/ambient";
import { getStorageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ coverId: z.string().regex(AMBIENT_COVER_ID_RE) });

/** Descargas en paralelo al verificar: suficiente para ~23 archivos sin saturar la función serverless. */
const BATCH = 6;

/**
 * Paso 2: el navegador ya subió los archivos. Acá el servidor VERIFICA lo que realmente quedó guardado (existe, pesa lo
 * declarado, es una imagen WebP/AVIF de verdad y coincide con su hash), arma el póster que usan las tarjetas y deja la
 * portada lista. Si algo no coincide se borra todo lo subido: no queda nada a medias.
 */
export async function POST(req: Request) {
  const guard = await ambientGuard(req, "ambient-register", 20);
  if (guard instanceof NextResponse) return guard;
  const { access } = guard;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return ambientError("Datos inválidos.", 400);
  const { coverId } = parsed.data;

  try {
    await connectDB();
    const cover = await AmbientCover.findOne({ coverId }).lean();
    // Una portada ajena es indistinguible de una inexistente.
    if (!cover || (!access.isAdmin && String(cover.agencyId) !== access.agencyId)) return ambientError("No encontramos esa portada.", 404);
    if (cover.status === "ready") return NextResponse.json(toCoverSummary(cover), { headers: AMBIENT_NO_STORE });

    const agencyId = String(cover.agencyId);
    const manifest = cover.manifest as AmbientManifest;
    const provider = await getStorageProvider();
    const folder = ambientFolder(agencyId, coverId);
    const refs = referencedFiles(manifest);
    const buffers = new Map<string, Buffer>();

    try {
      for (let i = 0; i < refs.length; i += BATCH) {
        await Promise.all(
          refs.slice(i, i + BATCH).map(async (ref) => {
            let buffer: Buffer | null;
            try {
              buffer = await provider.readFolderFile(folder, ref.name, AMBIENT_MAX_FILE_BYTES);
            } catch (err) {
              if (err instanceof Error && err.message === "Archivo demasiado grande") {
                throw new AmbientValidationError("too-big", `La imagen ${ref.name} es demasiado pesada.`);
              }
              throw err;
            }
            if (!buffer) throw new AmbientValidationError("missing-file", `No se terminó de subir ${ref.label}. Probá de nuevo.`);
            await verifyFileBytes(ref, buffer);
            buffers.set(ref.name, buffer);
          })
        );
      }
    } catch (err) {
      await deleteCover(coverId);
      if (err instanceof AmbientValidationError) return ambientError(err.message, 400, { code: err.code });
      throw err;
    }

    // Póster = el estado inicial como imagen común (las tarjetas, el mapa y la imagen para compartir no cargan WebGL).
    const initial = manifest.states.find((s) => s.id === manifest.initialState)!;
    const plate = initial.plates.desktop?.webp ?? initial.plates.mobile?.webp;
    const posterBuffer = plate ? buffers.get(plate.file) : undefined;
    if (!posterBuffer) {
      await deleteCover(coverId);
      return ambientError("No pudimos preparar la imagen de portada. Probá de nuevo.", 503);
    }
    const poster = await provider.upload({ buffer: posterBuffer, filename: "poster.webp", folder: ambientPosterFolder(agencyId) });

    const ready = await AmbientCover.findOneAndUpdate(
      { coverId },
      { status: "ready", poster: { url: poster.url, providerId: poster.providerId, width: poster.width, height: poster.height } },
      { new: true }
    ).lean();
    if (!ready) return ambientError("No encontramos esa portada.", 404);
    return NextResponse.json(toCoverSummary(ready), { status: 201, headers: AMBIENT_NO_STORE });
  } catch (err) {
    console.error("POST /api/dashboard/ambient/register failed:", err);
    return ambientError("No se pudo verificar la portada. Probá de nuevo en un momento.", 503);
  }
}
