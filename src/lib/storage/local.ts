import { writeFile, unlink, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AssetInfo, StorageProvider, UploadInput, UploadResult } from "./index";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

/** El `providerId` local es sólo un nombre de archivo: nunca una ruta (sin `..` ni separadores). */
function safeName(providerId: string): string | null {
  return providerId && path.basename(providerId) === providerId && !providerId.startsWith(".") ? providerId : null;
}

/**
 * Provider de desarrollo: guarda archivos en /public/uploads para poder
 * trabajar sin crear una cuenta de Cloudinary todavía. No usar en
 * producción (el filesystem de Netlify/Render es efímero).
 */
async function upload({ buffer, filename, folder }: UploadInput): Promise<UploadResult> {
  const ext = path.extname(filename) || ".jpg";
  const id = `${folder ? folder.replace(/\//g, "-") + "-" : ""}${randomUUID()}${ext}`;
  await writeFile(path.join(UPLOADS_DIR, id), buffer);
  return { url: `/uploads/${id}`, providerId: id };
}

async function del(providerId: string): Promise<void> {
  const name = safeName(providerId);
  if (!name) return;
  await unlink(path.join(UPLOADS_DIR, name)).catch(() => {});
}

/** Los archivos locales llevan la carpeta en el nombre: `agencies-<id>-properties-<uuid>.jpg`. */
async function deleteAgencyAssets(agencyId: string): Promise<number> {
  // El id sólo entra en un prefijo de nombre de archivo: se valida para que no pueda escapar de la carpeta.
  if (!/^[a-f0-9]{24}$/.test(agencyId)) return 0;
  const prefix = `agencies-${agencyId}-`;
  try {
    const files = (await readdir(UPLOADS_DIR)).filter((name) => name.startsWith(prefix));
    await Promise.all(files.map((name) => unlink(path.join(UPLOADS_DIR, name)).catch(() => {})));
    return files.length;
  } catch {
    return 0;
  }
}

/** En desarrollo no hay subida directa: el llamador sube por el servidor. */
async function signDirectUpload(): Promise<null> {
  return null;
}

async function inspect(providerId: string): Promise<AssetInfo | null> {
  const name = safeName(providerId);
  if (!name) return null;
  try {
    const info = await stat(path.join(UPLOADS_DIR, name));
    return { url: `/uploads/${name}`, providerId: name, bytes: info.size };
  } catch {
    return null;
  }
}

export const localStorage: StorageProvider = { upload, delete: del, deleteAgencyAssets, signDirectUpload, inspect };
