import type { AmbientCoverSummary, AmbientSignResponse, AmbientUploadTicket } from "@/lib/ambient/types";
import { validateFolder, type FolderEntry, type ValidatedFolder } from "@/lib/ambient/validate";

export type AmbientUploadPhase = "checking" | "uploading" | "verifying";
export type AmbientUploadProgress = { phase: AmbientUploadPhase; done: number; total: number };

/** Archivos que suben a la vez: rápido sin saturar una conexión móvil. */
const CONCURRENCY = 4;

async function errorOf(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.error === "string") return body.error;
    if (typeof body?.error?.message === "string") return body.error.message; // formato de Cloudinary
  } catch {
    /* sin cuerpo JSON */
  }
  return fallback;
}

async function sendFile(
  sign: AmbientSignResponse,
  file: ValidatedFolder["files"][number],
  ticket: AmbientUploadTicket | undefined
): Promise<void> {
  const blob = new Blob([file.data as unknown as BlobPart], { type: file.ref.name.endsWith(".avif") ? "image/avif" : "image/webp" });
  const form = new FormData();
  let res: Response;
  if (sign.local) {
    // Desarrollo sin Cloudinary: sube por el servidor.
    form.append("coverId", sign.coverId);
    form.append("name", file.ref.name);
    form.append("file", blob, file.ref.name);
    res = await fetch("/api/dashboard/ambient/local", { method: "POST", body: form });
  } else {
    if (!ticket) throw new Error("No se pudo preparar la subida.");
    for (const [key, value] of Object.entries(ticket.fields)) form.append(key, value);
    form.append("file", blob, file.ref.name);
    res = await fetch(ticket.uploadUrl, { method: "POST", body: form });
  }
  if (!res.ok) throw new Error(await errorOf(res, "No se pudo subir una de las imágenes. Revisá tu conexión y probá de nuevo."));
}

/**
 * Sube una portada viva en tres pasos: (1) revisa la carpeta acá mismo, (2) pide al servidor que firme la subida
 * directa de cada archivo y los sube, (3) pide al servidor que verifique lo que quedó guardado. Devuelve la portada ya
 * verificada. Si algo falla, lo subido se borra. Los errores traen un mensaje listo para mostrar.
 */
export async function uploadAmbientFolder(
  entries: FolderEntry[],
  { agencyId, onProgress }: { agencyId?: string; onProgress?: (p: AmbientUploadProgress) => void } = {}
): Promise<AmbientCoverSummary> {
  onProgress?.({ phase: "checking", done: 0, total: 1 });
  const folder = await validateFolder(entries, (done, total) => onProgress?.({ phase: "checking", done, total }));

  const signRes = await fetch("/api/dashboard/ambient/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...(agencyId ? { agencyId } : {}), manifestText: folder.manifestText }),
  });
  if (!signRes.ok) throw new Error(await errorOf(signRes, "No se pudo preparar la subida."));
  const sign = (await signRes.json()) as AmbientSignResponse;

  try {
    const tickets = new Map(sign.local ? [] : sign.tickets.map((t) => [t.name, t] as const));
    const queue = [...folder.files];
    let done = 0;
    onProgress?.({ phase: "uploading", done, total: queue.length });
    const total = queue.length;
    const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, async () => {
      for (;;) {
        const file = queue.shift();
        if (!file) return;
        await sendFile(sign, file, tickets.get(file.ref.name));
        onProgress?.({ phase: "uploading", done: ++done, total });
      }
    });
    await Promise.all(workers);

    onProgress?.({ phase: "verifying", done: 0, total: 1 });
    const regRes = await fetch("/api/dashboard/ambient/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverId: sign.coverId }),
    });
    if (!regRes.ok) throw new Error(await errorOf(regRes, "No se pudo verificar la portada. Probá de nuevo."));
    return (await regRes.json()) as AmbientCoverSummary;
  } catch (err) {
    // Que no queden archivos a medias (si el servidor ya los borró, esto devuelve 404 y no pasa nada).
    void deleteAmbientCover(sign.coverId);
    throw err;
  }
}

/** Quita una portada subida que todavía no se usa en ninguna propiedad. Mejor esfuerzo: nunca lanza. */
export async function deleteAmbientCover(coverId: string): Promise<void> {
  try {
    await fetch(`/api/dashboard/ambient/${coverId}`, { method: "DELETE" });
  } catch {
    /* si falla, el servidor la limpia sola pasadas 24 h */
  }
}
