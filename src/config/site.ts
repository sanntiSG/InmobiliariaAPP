/**
 * Configuración general del sitio: contacto del proveedor, límites de mapa,
 * valores por defecto. No confundir con `brand.ts` (identidad visual).
 */

/** Número del proveedor de la plataforma (formato internacional, sin "+"). */
export const PROVIDER_WHATSAPP =
  process.env.NEXT_PUBLIC_PROVIDER_WHATSAPP ?? "5491137796683";

/**
 * Nombre de la cookie (y, por compatibilidad hacia atrás, de la key de
 * `localStorage`) donde se persiste el tema claro/oscuro elegido a mano.
 * Compartido entre `layout.tsx` (la lee en el servidor para setear
 * `data-theme` en el HTML que manda SSR, sin flash) y `ThemeToggle.tsx` (la
 * escribe al togglear) — ver ese componente para el detalle completo.
 */
export const THEME_COOKIE_NAME = "umbral-theme";

/**
 * Emails que reciben rol "admin" automáticamente al iniciar sesión con Google.
 * Se leen de `ADMIN_EMAILS` (separados por coma) — ver `src/auth.ts`.
 */
export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "ssantii200@gmail.com")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export function buildWhatsappLink(message: string, phone = PROVIDER_WHATSAPP) {
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${phone}?text=${encoded}`;
}

/** Centro y bounds por defecto del mapa: Buenos Aires / AMBA. */
export const MAP_DEFAULTS = {
  center: [-58.4173, -34.6118] as [number, number],
  zoom: 11,
  // 5 y no 4: a zoom 4 el viewport pedido es más ancho que los ~20° de
  // longitud de ARGENTINA_BOUNDS, y MapLibre tiene que reconciliar eso en
  // el constructor antes del primer render — eso dejaba el mapa en blanco.
  minZoom: 5,
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

/** Radio (en km) que cuenta como "cerca" de la ubicación del usuario — ver /api/map/nearest. */
export const NEARBY_RADIUS_KM = 50;
