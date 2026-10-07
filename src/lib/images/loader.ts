/**
 * Loader global de `next/image` (ver `images.loaderFile` en next.config.ts).
 *
 * Las fotos subidas por las inmobiliarias viven en Cloudinary a tamaño original; con el
 * optimizador de Next cada tarjeta obligaba al servidor a bajarse la foto completa y
 * reducirla (lento sobre todo la primera vez). Acá se le pide a Cloudinary la versión
 * ya reducida, que sale de su CDN cacheada y nunca pasa por nuestro servidor.
 */

const CLOUDINARY_UPLOAD = "https://res.cloudinary.com/";
const UNSPLASH = "https://images.unsplash.com/";

/** URL de una imagen a `width` px de ancho (sin recortar); las que no sabemos reducir quedan como están. */
export function thumbUrl(src: string, width: number, quality = 75): string {
  if (src.startsWith(CLOUDINARY_UPLOAD)) {
    const marker = "/upload/";
    const i = src.indexOf(marker);
    if (i === -1) return src;
    // Si ya trae una transformación nuestra (`w_…`) no se agrega otra.
    if (/\/upload\/[^/]*\bw_\d+/.test(src)) return src;
    return `${src.slice(0, i + marker.length)}w_${width},c_limit,q_auto,f_auto/${src.slice(i + marker.length)}`;
  }
  if (src.startsWith(UNSPLASH)) {
    try {
      const u = new URL(src);
      u.searchParams.set("w", String(width));
      u.searchParams.set("q", String(quality));
      return u.toString();
    } catch {
      return src;
    }
  }
  return src;
}

/**
 * Anchos fijos: Next pide ~16 anchos distintos y cada uno cuenta como una transformación en Cloudinary.
 * Redondeando hacia arriba a estos 4, cada foto genera como máximo 4 versiones (casi siempre 1 o 2).
 */
const WIDTH_STEPS = [128, 640, 1080, 1920];

export function snapWidth(width: number): number {
  return WIDTH_STEPS.find((w) => width <= w) ?? WIDTH_STEPS[WIDTH_STEPS.length - 1]!;
}

export default function imageLoader({ src, width, quality }: { src: string; width: number; quality?: number }): string {
  return thumbUrl(src, snapWidth(width), quality ?? 75);
}
