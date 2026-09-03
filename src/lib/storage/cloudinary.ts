import { v2 as cloudinary } from "cloudinary";
import type { StorageProvider, UploadInput, UploadResult } from "./index";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

async function upload({ buffer, folder }: UploadInput): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: folder ? `umbral/${folder}` : "umbral",
        resource_type: "image",
        // Cloudinary optimiza formato/calidad automáticamente (free tier).
        transformation: [{ fetch_format: "auto", quality: "auto" }],
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
