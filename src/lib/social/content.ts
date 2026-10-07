import { brand } from "@/config/brand";
import { OPERATION_LABELS, PROPERTY_TYPE_LABELS, type Operation, type PropertyType } from "@/config/filters";
import { formatPrice } from "@/lib/utils/format";

/** Datos ya listos para insertar en un template (nada de lógica adentro de los templates). */
export type PostData = {
  /** URL o data URI ya resuelta de la foto de portada. */
  photo: string;
  title: string;
  location: string;
  operation: string;
  price: string;
  priceSuffix: string;
  /** "120 m²", "3 ambientes", "2 habitaciones" — sólo lo que existe. */
  specs: string[];
  agencyName: string;
  agencyLogo: string | null;
  accent: string;
  /** Color de texto legible sobre `accent`. */
  onAccent: string;
};

type PropertyInput = {
  type: string;
  operation: string;
  price?: { amount?: number | null; currency?: string | null } | null;
  address?: { neighborhood?: string | null; city?: string | null } | null;
  features?: {
    rooms?: number | null;
    bedrooms?: number | null;
    coveredArea?: number | null;
    totalArea?: number | null;
  } | null;
};

type AgencyInput = {
  name: string;
  logo?: string | null;
  branding?: { accentColor?: string | null } | null;
};

/** Sólo hex válido (con o sin alfa); cualquier otra cosa cae al acento de la marca. */
export function safeAccent(raw: string | null | undefined): string {
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec((raw ?? "").trim());
  if (hex) return `#${hex[1]}`;
  return brand.accentColor.slice(0, 7);
}

/** Blanco o casi negro según cuál se lea mejor sobre el color dado. */
export function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#10131a" : "#ffffff";
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Arma los textos: "Casa en Ezeiza", "US$120.000", "120 m² · 3 ambientes · 2 habitaciones". */
export function buildPostData(
  property: PropertyInput,
  agency: AgencyInput,
  photo: string,
  agencyLogo: string | null
): PostData {
  const typeLabel = PROPERTY_TYPE_LABELS[property.type as PropertyType] ?? "Propiedad";
  const place = property.address?.neighborhood || property.address?.city || "";
  const title = place ? `${typeLabel} en ${place}` : typeLabel;
  const accent = safeAccent(agency.branding?.accentColor);

  const area = property.features?.coveredArea || property.features?.totalArea || 0;
  const rooms = property.features?.rooms ?? 0;
  const bedrooms = property.features?.bedrooms ?? 0;
  const specs = [
    area > 0 ? `${new Intl.NumberFormat("es-AR").format(area)} m²` : null,
    rooms > 0 ? plural(rooms, "ambiente", "ambientes") : null,
    bedrooms > 0 ? plural(bedrooms, "habitación", "habitaciones") : null,
  ].filter((s): s is string => s !== null);

  const op = property.operation as Operation;
  return {
    photo,
    title,
    location: [property.address?.neighborhood, property.address?.city]
      .filter((s, i, a): s is string => !!s && a.indexOf(s) === i && !title.includes(s))
      .join(", "),
    operation: op === "venta" ? "En venta" : op === "alquiler" ? "En alquiler" : OPERATION_LABELS[op] ?? "",
    price: formatPrice(property.price?.amount ?? 0, property.price?.currency ?? "USD"),
    priceSuffix: op === "venta" ? "" : "/mes",
    specs,
    agencyName: agency.name,
    agencyLogo,
    accent,
    onAccent: readableOn(accent),
  };
}
