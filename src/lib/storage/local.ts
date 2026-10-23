import { writeFile, unlink, readdir, stat, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isSafeFolder, isSafeFolderFileName } from "./index";
import type { AssetInfo, StorageProvider, UploadInput, UploadResult } from "./index";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

/** Carpeta en disco de un set de archivos (portada viva): `public/uploads/<folder>`, nunca fuera de `uploads`. */
function folderDir(folder: string): string | null {
  if (!isSafeFolder(folder)) return null;
  const dir = path.resolve(UPLOADS_DIR, folder);
  return dir.startsWith(UPLOADS_DIR + path.sep) ? dir : null;
}

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
    // Las portadas vivas (y sus pósters) viven en carpetas: `uploads/agencies/<id>/…`.
    await rm(path.join(UPLOADS_DIR, "agencies", agencyId), { recursive: true, force: true });
    return files.length;
  } catch {
    return 0;
  }
}

function folderUrl(folder: string): string {
  if (!folderDir(folder)) throw new Error("Carpeta inválida");
  return `/uploads/${folder}/`;
}

async function putFolderFile({ folder, fileName, buffer }: { folder: string; fileName: string; buffer: Buffer }): Promise<void> {
  const dir = folderDir(folder);
  if (!dir || !isSafeFolderFileName(fileName)) throw new Error("Ruta inválida");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), buffer);
}

async function readFolderFile(folder: string, fileName: string, maxBytes: number): Promise<Buffer | null> {
  const dir = folderDir(folder);
  if (!dir || !isSafeFolderFileName(fileName)) return null;
  try {
    const file = path.join(dir, fileName);
    if ((await stat(file)).size > maxBytes) throw new Error("Archivo demasiado grande");
    return await readFile(file);
  } catch (err) {
    if (err instanceof Error && err.message === "Archivo demasiado grande") throw err;
    return null;
  }
}

async function deleteFolder(folder: string): Promise<void> {
  const dir = folderDir(folder);
  if (!dir) return;
  await rm(dir, { recursive: true, force: true }).catch(() => {});
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

export const localStorage: StorageProvider = {
  upload,
  delete: del,
  deleteAgencyAssets,
  signDirectUpload,
  inspect,
  folderUrl,
  putFolderFile,
  readFolderFile,
  deleteFolder,
};
