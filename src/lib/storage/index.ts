export type ResourceType = "image" | "raw";

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
  /**
   * "image" (default) para fotos. "raw" para archivos que no son imágenes (ej. el
   * modelo 3D `.glb` del asesor): se suben tal cual, sin transformaciones, y la
   * URL conserva la extensión original.
   */
  resourceType?: ResourceType;
};

export type UploadResult = {
  url: string;
  /** id propio del provider — necesario para poder borrar el asset después. */
  providerId: string;
  width?: number;
  height?: number;
};

/** Permiso firmado para que el NAVEGADOR suba un archivo directo al storage, sin pasar por nuestro servidor. */
export type DirectUploadTicket = {
  uploadUrl: string;
  /** Campos que el navegador debe mandar tal cual en el FormData, antes de `file`. */
  fields: Record<string, string>;
  /** `public_id` con el que va a quedar el archivo (el servidor lo vuelve a verificar al registrarlo). */
  providerId: string;
  resourceType: ResourceType;
};

export type AssetInfo = { url: string; providerId: string; bytes: number };

export interface StorageProvider {
  upload(input: UploadInput): Promise<UploadResult>;
  delete(providerId: string, resourceType?: ResourceType): Promise<void>;
  /**
   * Borra TODO lo que subió una inmobiliaria (fotos, fotos 360°, logo y
   * portada). Devuelve cuántos archivos eliminó. Mejor esfuerzo: nunca lanza,
   * porque un fallo del storage no debe impedir limpiar la base de datos.
   */
  deleteAgencyAssets(agencyId: string): Promise<number>;
  /**
   * Firma una subida directa desde el navegador (esquiva el tope de payload de las
   * funciones serverless). `null` si este provider no lo soporta (el de desarrollo
   * local): el llamador usa entonces la subida por el servidor.
   */
  signDirectUpload(input: {
    folder: string;
    /** Extensión con punto, ej. ".glb" (validada por el provider). */
    extension: string;
    resourceType: ResourceType;
  }): Promise<DirectUploadTicket | null>;
  /** Tamaño y URL de un archivo ya subido, o `null` si no existe. Sirve para verificar antes de registrarlo. */
  inspect(providerId: string, resourceType?: ResourceType): Promise<AssetInfo | null>;
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
