/** Valores compartidos de la portada viva (navegador y servidor). El resto de la lógica vive en `validate.ts`. */

/** Aviso obligatorio del reproductor: la plataforma lo fuerza al registrar cada portada (no se confía en el del archivo). */
export const AMBIENT_DISCLOSURE =
  "Ambientación digital generada a partir de una fotografía; no es un registro fotográfico real.";

export const AMBIENT_MANIFEST_FILE = "experience.json";

/** Topes de una portada. Una carpeta típica pesa ≈1,5 MB en ≈23 archivos; esto deja margen sin abrir la puerta a abusos. */
export const AMBIENT_MAX_FILES = 40;
export const AMBIENT_MAX_FILE_BYTES = 1.5 * 1024 * 1024;
export const AMBIENT_MAX_TOTAL_BYTES = 8 * 1024 * 1024;
export const AMBIENT_MANIFEST_MAX_BYTES = 200 * 1024;
export const AMBIENT_MAX_STATES = 8;
/** Portadas subidas y todavía sin usar en ninguna propiedad, por inmobiliaria. */
export const AMBIENT_MAX_UNATTACHED = 6;
/** Una portada sin usar se limpia sola pasado este tiempo. */
export const AMBIENT_UNATTACHED_TTL_MS = 24 * 60 * 60 * 1000;

/** Nombre de un archivo de la carpeta: es el mismo patrón que exige el reproductor (sin `/`, `..` ni extensiones raras). */
export const AMBIENT_FILE_RE = /^[a-z0-9-]+\.(desktop|mobile)\.[0-9a-f]{12}\.(avif|webp)$/;
export const AMBIENT_STATE_ID_RE = /^[a-z0-9-]{1,24}$/;
export const AMBIENT_COVER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Valor de `start` cuando el estado inicial depende de la hora de quien mira. */
export const AMBIENT_START_AUTO = "auto";

/** Carpeta lógica del storage de una portada (el provider le antepone `umbral/` en Cloudinary). */
export function ambientFolder(agencyId: string, coverId: string): string {
  return `agencies/${agencyId}/ambient/${coverId}`;
}

/** Carpeta del póster (imagen común, la que usan las tarjetas y la imagen para compartir). */
export function ambientPosterFolder(agencyId: string): string {
  return `agencies/${agencyId}/ambient-posters`;
}
