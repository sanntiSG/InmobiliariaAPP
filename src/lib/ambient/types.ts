import type { AmbientManifest } from "@/vendor/ambient";

/** Lo que el servidor le devuelve al navegador de una portada ya verificada (nunca incluye datos de otra inmobiliaria). */
export type AmbientCoverSummary = {
  coverId: string;
  /** Carpeta de archivos, con `/` final y sin versión. */
  baseUrl: string;
  /** Copia saneada del manifest. */
  manifest: AmbientManifest;
  poster: { url: string; width?: number; height?: number };
  bytes: number;
};

/** Ticket firmado para subir UN archivo directo a Cloudinary (campos tal cual, antes de `file`). */
export type AmbientUploadTicket = { name: string; uploadUrl: string; fields: Record<string, string> };

export type AmbientSignResponse =
  | { coverId: string; local: false; tickets: AmbientUploadTicket[] }
  | { coverId: string; local: true; names: string[] };

/** Lo único que la propiedad guarda del lado del formulario: qué portada, qué estados y con cuál arranca. */
export type AmbientSelection = {
  coverId: string;
  /** Ids de los estados activos (subconjunto de los del manifest, al menos uno). */
  states: string[];
  /** `"auto"` = según la hora de quien mira, o el id de un estado. */
  start: string;
};
