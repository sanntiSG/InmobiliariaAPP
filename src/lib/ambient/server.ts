import { connectDB } from "@/lib/db/connect";
import { AmbientCover, type AmbientCoverDoc } from "@/lib/db/models/AmbientCover";
import { getStorageProvider } from "@/lib/storage";
import { AMBIENT_COVER_ID_RE, AMBIENT_UNATTACHED_TTL_MS, ambientFolder } from "./constants";
import type { AmbientCoverSummary } from "./types";

/** Sólo el servidor: ciclo de vida de las portadas vivas (borrado, barrido de las sin usar, resumen para el navegador). */

type CoverFiles = Pick<AmbientCoverDoc, "coverId" | "poster"> & { agencyId: unknown };

/** Borra los archivos de una portada (carpeta `raw` + póster). Mejor esfuerzo: un fallo del storage no frena nada. */
async function deleteCoverFiles(cover: CoverFiles): Promise<void> {
  const provider = await getStorageProvider();
  await provider.deleteFolder(ambientFolder(String(cover.agencyId), cover.coverId));
  if (cover.poster?.providerId) await provider.delete(cover.poster.providerId).catch(() => {});
}

/** Borra la portada: sus archivos y su registro. No mira si está en uso (eso lo decide quien llama). */
export async function deleteCover(coverId: string): Promise<void> {
  if (!AMBIENT_COVER_ID_RE.test(coverId)) return;
  const cover = await AmbientCover.findOneAndDelete({ coverId }).lean();
  if (cover) await deleteCoverFiles(cover);
}

/** Suelta la portada de una propiedad que ya no la usa (quitada, reemplazada o propiedad borrada). Nunca lanza. */
export async function releaseCover(coverId: string | null | undefined): Promise<void> {
  if (!coverId) return;
  try {
    await connectDB();
    await deleteCover(coverId);
  } catch (err) {
    console.error("releaseCover failed:", err);
  }
}

/**
 * Limpia las portadas de una inmobiliaria que se subieron y nunca se usaron en una propiedad (se abandonó el
 * formulario, se reemplazó antes de guardar, falló la verificación…). Sin cron: corre cuando esa inmobiliaria sube otra.
 */
export async function sweepUnattached(agencyId: string): Promise<void> {
  const stale = await AmbientCover.find({
    agencyId,
    attachedTo: null,
    createdAt: { $lt: new Date(Date.now() - AMBIENT_UNATTACHED_TTL_MS) },
  })
    .select("coverId agencyId poster")
    .lean();
  for (const cover of stale) {
    await AmbientCover.deleteOne({ _id: cover._id });
    await deleteCoverFiles(cover);
  }
}

/** Resumen de una portada lista, el que se le devuelve al navegador. */
export function toCoverSummary(cover: Pick<AmbientCoverDoc, "coverId" | "baseUrl" | "manifest" | "poster" | "bytes">): AmbientCoverSummary {
  return {
    coverId: cover.coverId,
    baseUrl: cover.baseUrl,
    manifest: cover.manifest as AmbientCoverSummary["manifest"],
    poster: { url: cover.poster!.url!, width: cover.poster?.width ?? undefined, height: cover.poster?.height ?? undefined },
    bytes: cover.bytes ?? 0,
  };
}
