import { AmbientCover } from "@/lib/db/models/AmbientCover";
import type { AmbientManifest } from "@/vendor/ambient";
import { AMBIENT_START_AUTO } from "./constants";
import type { AmbientSelection } from "./types";

/**
 * Une una portada ya subida y verificada con una propiedad. Sólo servidor.
 *
 * El navegador manda `{ coverId, states, start }` y nada más: de acá sale TODO lo que se guarda en la propiedad
 * (manifest, carpeta, póster), leído de la portada que el servidor mismo verificó en `/api/dashboard/ambient/register`.
 */

export class AmbientSelectionError extends Error {}

/** Lo que se guarda en `Property.media.ambient`. */
export type StoredAmbient = {
  coverId: string;
  baseUrl: string;
  manifest: AmbientManifest;
  states: string[];
  start: string;
  poster: { url: string; providerId?: string; width?: number; height?: number };
};

/**
 * Resuelve la selección contra la portada real. `null`/`undefined` = la propiedad no usa portada viva.
 * Lanza `AmbientSelectionError` (mensaje listo para mostrar) si la portada no existe, es de otra inmobiliaria, ya se
 * usa en otra propiedad o los estados no corresponden.
 */
export async function resolveAmbient(opts: {
  agencyId: string;
  /** Propiedad que se está editando (no existe todavía al crear). */
  propertyId?: string;
  selection: AmbientSelection | null | undefined;
}): Promise<StoredAmbient | null> {
  const { agencyId, propertyId, selection } = opts;
  if (!selection) return null;

  const cover = await AmbientCover.findOne({ coverId: selection.coverId, status: "ready" }).lean();
  if (!cover || !cover.poster?.url) {
    throw new AmbientSelectionError("La portada viva ya no está disponible. Subila de nuevo.");
  }
  if (String(cover.agencyId) !== agencyId) {
    throw new AmbientSelectionError("Esa portada viva es de otra inmobiliaria. Quitala y subila de nuevo para esta propiedad.");
  }
  if (cover.attachedTo && String(cover.attachedTo) !== propertyId) {
    throw new AmbientSelectionError("Esa portada viva ya se usa en otra propiedad.");
  }

  const manifest = cover.manifest as AmbientManifest;
  const known = new Set(manifest.states.map((s) => s.id));
  if (selection.states.some((id) => !known.has(id))) {
    throw new AmbientSelectionError("Algún estado elegido no existe en esta portada viva.");
  }
  // En el orden del manifest y sin repetir.
  const states = manifest.states.map((s) => s.id).filter((id) => selection.states.includes(id));
  if (states.length === 0) throw new AmbientSelectionError("Dejá al menos un estado activo en la portada viva.");

  return {
    coverId: cover.coverId,
    baseUrl: cover.baseUrl,
    manifest,
    states,
    start: selection.start !== AMBIENT_START_AUTO && states.includes(selection.start) ? selection.start : AMBIENT_START_AUTO,
    poster: {
      url: cover.poster.url,
      providerId: cover.poster.providerId ?? undefined,
      width: cover.poster.width ?? undefined,
      height: cover.poster.height ?? undefined,
    },
  };
}

/** Marca la portada como usada por la propiedad (deja de poder limpiarse como "sin usar"). */
export async function markAmbientAttached(coverId: string, propertyId: string): Promise<void> {
  await AmbientCover.updateOne({ coverId }, { attachedTo: propertyId });
}
