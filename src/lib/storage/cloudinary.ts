import { v2 as cloudinary } from "cloudinary";
import type { StorageProvider, UploadInput, UploadResult } from "./index";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

async function upload({ buffer, folder, quality = "auto" }: UploadInput): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: folder ? `umbral/${folder}` : "umbral",
        resource_type: "image",
        // Cloudinary optimiza formato/calidad automáticamente (free tier).
        // "best" pide bastante menos compresión — para foto 360°, donde se
        // hace zoom dentro de la esfera y la pérdida se nota mucho más.
        // Las fotos comunes además se limitan a 2560 px: un original de 12 MP no aporta nada en
        // pantalla y hacía pesadísima cada tarjeta. La foto 360° conserva su resolución completa.
        transformation: [
          {
            fetch_format: "auto",
            quality: quality === "best" ? "auto:best" : "auto",
            ...(quality === "best" ? {} : { width: 2560, height: 2560, crop: "limit" }),
          },
        ],
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

/**
 * Todo lo de una inmobiliaria vive bajo `umbral/agencies/<id>/` (propiedades,
 * fotos 360°, logo y portada), así que alcanza con borrar por prefijo.
 */
async function deleteAgencyAssets(agencyId: string): Promise<number> {
  // El id se interpola en un prefijo de la API de administración: se valida antes.
  if (!/^[a-f0-9]{24}$/.test(agencyId)) return 0;
  const prefix = `umbral/agencies/${agencyId}/`;
  let deleted = 0;
  try {
    // La API borra de a lotes (hasta 1000): se repite mientras diga que quedó algo.
    for (let i = 0; i < 20; i++) {
      const res = await cloudinary.api.delete_resources_by_prefix(prefix);
      deleted += Object.values(res.deleted ?? {}).filter((v) => v === "deleted").length;
      if (!res.partial) break;
    }
    // Las carpetas vacías quedan en el panel de Cloudinary: se limpian (si ya no existen, no pasa nada).
    for (const sub of ["properties", "branding", ""]) {
      await cloudinary.api
        .delete_folder(`umbral/agencies/${agencyId}${sub ? `/${sub}` : ""}`)
        .catch(() => {});
    }
  } catch (err) {
    console.error("cloudinary deleteAgencyAssets failed:", err);
  }
  return deleted;
}

export const cloudinaryStorage: StorageProvider = { upload, delete: del, deleteAgencyAssets };
