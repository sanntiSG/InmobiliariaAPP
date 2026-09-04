/**
 * Configuración general del sitio: contacto del proveedor, límites de mapa,
 * valores por defecto. No confundir con `brand.ts` (identidad visual).
 */

/** Número del proveedor de la plataforma (formato internacional, sin "+"). */
export const PROVIDER_WHATSAPP =
  process.env.NEXT_PUBLIC_PROVIDER_WHATSAPP ?? "5491137796683";

export function buildWhatsappLink(message: string, phone = PROVIDER_WHATSAPP) {
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${phone}?text=${encoded}`;
}

/** Centro y bounds por defecto del mapa: Buenos Aires / AMBA. */
export const MAP_DEFAULTS = {
  center: [-58.4173, -34.6118] as [number, number],
  zoom: 11,
  minZoom: 4,
  maxZoom: 19,
  bounds: {
    // AMBA aproximado — usado para clamping y seed de datos demo.
    west: -59.3,
    south: -35.3,
    east: -57.6,
    north: -34.2,
  },
} as const;

/** Bounding box aproximado de Argentina continental + insular — usado para acotar búsquedas y mapas al país. */
export const ARGENTINA_BOUNDS = {
  west: -73.6,
  south: -55.1,
  east: -53.6,
  north: -21.8,
} as const;

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "US$",
  ARS: "$",
};
