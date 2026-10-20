import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import type {
  AssetInfo,
  DirectUploadTicket,
  ResourceType,
  StorageProvider,
  UploadInput,
  UploadResult,
} from "./index";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/** Extensión segura para un archivo "raw": punto + 1 a 5 letras/números en minúscula. */
const EXTENSION_RE = /^\.[a-z0-9]{1,5}$/;

/** Para `raw`, Cloudinary exige que el `public_id` incluya la extensión: así la URL final también la conserva. */
function rawPublicId(folder: string | undefined, filename: string): string {
  const ext = (filename.match(/\.[A-Za-z0-9]{1,5}$/)?.[0] ?? "").toLowerCase();
  return `${folder ? `umbral/${folder}` : "umbral"}/${randomUUID()}${EXTENSION_RE.test(ext) ? ext : ""}`;
}

async function upload({
  buffer,
  filename,
  folder,
  quality = "auto",
  resourceType = "image",
}: UploadInput): Promise<UploadResult> {
  const options =
    resourceType === "raw"
      ? { resource_type: "raw" as const, public_id: rawPublicId(folder, filename) }
      : {
          folder: folder ? `umbral/${folder}` : "umbral",
          resource_type: "image" as const,
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
        };

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error || !result) return reject(error ?? new Error("Upload sin resultado"));
      resolve({
        url: result.secure_url,
        providerId: result.public_id,
        width: result.width,
        height: result.height,
      });
    });
    stream.end(buffer);
  });
}

async function del(providerId: string, resourceType: ResourceType = "image"): Promise<void> {
  await cloudinary.uploader.destroy(providerId, { resource_type: resourceType });
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

async function signDirectUpload(input: {
  folder: string;
  extension: string;
  resourceType: ResourceType;
}): Promise<DirectUploadTicket | null> {
  if (!EXTENSION_RE.test(input.extension)) throw new Error("Extensión inválida");
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return null;

  // El `public_id` lo decide el servidor (carpeta + uuid): el cliente no elige dónde cae el archivo.
  const publicId = `umbral/${input.folder}/${randomUUID()}${input.extension}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request({ public_id: publicId, timestamp }, apiSecret);

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${input.resourceType}/upload`,
    fields: { api_key: apiKey, timestamp: String(timestamp), public_id: publicId, signature },
    providerId: publicId,
    resourceType: input.resourceType,
  };
}

async function inspect(providerId: string, resourceType: ResourceType = "image"): Promise<AssetInfo | null> {
  try {
    const res = await cloudinary.api.resource(providerId, { resource_type: resourceType });
    return { url: String(res.secure_url), providerId: String(res.public_id), bytes: Number(res.bytes) };
  } catch {
    return null;
  }
}

export const cloudinaryStorage: StorageProvider = {
  upload,
  delete: del,
  deleteAgencyAssets,
  signDirectUpload,
  inspect,
};
