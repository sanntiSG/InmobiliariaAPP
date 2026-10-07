import { writeFile, unlink, readdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { StorageProvider, UploadInput, UploadResult } from "./index";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

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
  await unlink(path.join(UPLOADS_DIR, providerId)).catch(() => {});
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

export const localStorage: StorageProvider = { upload, delete: del, deleteAgencyAssets };
