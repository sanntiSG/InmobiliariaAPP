import { v2 as cloudinary } from "cloudinary";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { StorageProvider, UploadInput, UploadResult } from "./index";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

async function upload({ buffer, filename, folder, resourceType = "image" }: UploadInput): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    // Para "raw" (archivos 3D: .glb/.gltf/.usdz) Cloudinary no aplica
    // ningún procesamiento de formato — a diferencia de las imágenes, si no
    // se fija un public_id con la extensión original la URL final queda
    // sin extensión. Algunos visores dependen de ella (ej. Quick Look de
    // iOS necesita ver ".usdz" al final de la URL para activarse).
    const ext = path.extname(filename);
    const publicId =
      resourceType === "raw"
        ? `${path
            .basename(filename, ext)
            .replace(/[^a-zA-Z0-9_-]/g, "_")
            .slice(0, 60)}-${randomUUID().slice(0, 8)}${ext}`
        : undefined;

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: folder ? `umbral/${folder}` : "umbral",
        resource_type: resourceType,
        ...(publicId ? { public_id: publicId } : {}),
        // Cloudinary optimiza formato/calidad automáticamente (free tier) — solo aplica a imágenes.
        ...(resourceType === "image" ? { transformation: [{ fetch_format: "auto", quality: "auto" }] } : {}),
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error("Upload sin resultado"));
        resolve({
          url: result.secure_url,
          providerId: result.public_id,
          width: result.width,
          height: result.height,
        });
      }
    );
    stream.end(buffer);
  });
}

async function del(providerId: string): Promise<void> {
  await cloudinary.uploader.destroy(providerId);
}

export const cloudinaryStorage: StorageProvider = { upload, delete: del };
