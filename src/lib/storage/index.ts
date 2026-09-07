export type UploadInput = {
  buffer: Buffer;
  filename: string;
  /** Carpeta lógica, ej: "agencies/{slug}/properties/{id}" */
  folder?: string;
  /**
   * "auto" (default) — buena calidad, buen tamaño de archivo, sirve para
   * fotos comunes. "best" — mucha menos compresión, para contenido que se
   * ve de cerca (ej. una foto 360° con zoom dentro de la esfera), donde la
   * compresión estándar se nota mucho más.
   */
  quality?: "auto" | "best";
};

export type UploadResult = {
  url: string;
  /** id propio del provider — necesario para poder borrar el asset después. */
  providerId: string;
  width?: number;
  height?: number;
};

export interface StorageProvider {
  upload(input: UploadInput): Promise<UploadResult>;
  delete(providerId: string): Promise<void>;
}

let cached: StorageProvider | null = null;

/**
 * Devuelve el provider de storage activo. Cloudinary si hay credenciales
 * configuradas (ver .env.example); si no, un provider local de desarrollo
 * que guarda en /public/uploads — para poder trabajar sin cuenta creada.
 * El resto de la app nunca importa cloudinary.ts/local.ts directamente,
 * siempre pasa por esta factory: cambiar de proveedor es reemplazar un archivo.
 */
export async function getStorageProvider(): Promise<StorageProvider> {
  if (cached) return cached;

  const hasCloudinary =
    !!process.env.CLOUDINARY_CLOUD_NAME &&
    !!process.env.CLOUDINARY_API_KEY &&
    !!process.env.CLOUDINARY_API_SECRET;

  // Import diferido: evita cargar el SDK de Cloudinary cuando no hace falta.
  if (hasCloudinary) {
    const { cloudinaryStorage } = await import("./cloudinary");
    cached = cloudinaryStorage;
  } else {
    const { localStorage } = await import("./local");
    cached = localStorage;
  }

  return cached;
}
