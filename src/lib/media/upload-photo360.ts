/**
 * Sube una foto 360° (equirectangular) por el mismo endpoint que las fotos
 * de la propiedad. `kind=photo360` pide menos compresión y un límite de
 * tamaño más alto (ver `src/app/api/dashboard/upload/route.ts`).
 */
export async function uploadPhoto360File(file: File, agencyId?: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("kind", "photo360");
  if (agencyId) formData.append("agencyId", agencyId);

  const res = await fetch("/api/dashboard/upload", { method: "POST", body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "No se pudo subir la foto 360°.");
  return data.url as string;
}
