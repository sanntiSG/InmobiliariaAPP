import { writeFile, unlink } from "node:fs/promises";
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

export const localStorage: StorageProvider = { upload, delete: del };
