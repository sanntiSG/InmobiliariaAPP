import {
  AMENITIES,
  AMENITY_LABELS,
  CURRENCIES,
  OPERATIONS,
  OPERATION_LABELS,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  type Amenity,
  type Currency,
  type Operation,
  type PropertyType,
} from "@/config/filters";
import { CURRENCY_SYMBOLS } from "@/config/site";
import { checkRange, formatDay } from "@/lib/availability";

/**
 * Estado de filtros compartido entre /mapa y /propiedades. Cada campo sin elegir vale `null`, `[]`, `false` o "todas": así
 * "sin filtro" es siempre lo mismo y contar, limpiar, guardar en la dirección y volver a leer es sencillo (ver `parseFilters`).
 */
export type PropertyFiltersState = {
  q: string;
  operation: Operation | "todas";
  types: PropertyType[];
  /** Moneda del rango de precio. Sin moneda no se filtra por precio: un número de dólares y uno de pesos no se comparan. */
  currency: Currency | null;
  priceMin: number | null;
  priceMax: number | null;
  minRooms: number | null;
  minBedrooms: number | null;
  minBathrooms: number | null;
  minGarages: number | null;
  /** Superficie en m² (cubierta si hay; si no, total). */
  areaMin: number | null;
  areaMax: number | null;
  /** Tiene TODAS estas comodidades. */
  amenities: Amenity[];
  city: string | null;
  neighborhood: string | null;
  tour3dOnly: boolean;
  ambientOnly: boolean;
  videoOnly: boolean;
  /** Publicadas en los últimos días (ver `RECENT_DAYS`). */
  recentOnly: boolean;
  /** Hasta cuántos metros de la playa (sólo cuentan las que informan la distancia). */
  beachMax: number | null;
  /** "Libre en mis fechas": del `from` al `to` (días `YYYY-MM-DD`, ambos o ninguno). Sólo alquileres. */
  from: string | null;
  to: string | null;
  /** Sólo propiedades de esta inmobiliaria (id). Viene del botón "Ver en mapa" de su perfil. */
  agencyId: string | null;
};

/** Cuántos días cuenta una propiedad como "publicada hace poco". */
export const RECENT_DAYS = 14;

export const DEFAULT_FILTERS: PropertyFiltersState = {
  q: "",
  operation: "todas",
  types: [],
  currency: null,
  priceMin: null,
  priceMax: null,
  minRooms: null,
  minBedrooms: null,
  minBathrooms: null,
  minGarages: null,
  areaMin: null,
  areaMax: null,
  amenities: [],
  city: null,
  neighborhood: null,
  tour3dOnly: false,
  ambientOnly: false,
  videoOnly: false,
  recentOnly: false,
  beachMax: null,
  from: null,
  to: null,
  agencyId: null,
};

/**
 * Cuántos filtros hay activos, para el número del botón "Filtros". No cuenta la búsqueda por texto ni la inmobiliaria: la primera
 * se ve en su propio cuadro y la segunda tiene su etiqueta aparte. La búsqueda por texto sí tiene etiqueta en la hoja de filtros
 * (`activeChips`), para que nunca quede un filtro que restringe los resultados sin poder verlo ni quitarlo.
 */
export function countActiveFilters(f: PropertyFiltersState): number {
  return (
    (f.operation !== "todas" ? 1 : 0) +
    (f.types.length > 0 ? 1 : 0) +
    (f.priceMin != null || f.priceMax != null ? 1 : 0) +
    (f.city || f.neighborhood ? 1 : 0) +
    (f.minRooms ? 1 : 0) +
    (f.minBedrooms ? 1 : 0) +
    (f.minBathrooms ? 1 : 0) +
    (f.minGarages ? 1 : 0) +
    (f.areaMin != null || f.areaMax != null ? 1 : 0) +
    f.amenities.length +
    (f.tour3dOnly ? 1 : 0) +
    (f.ambientOnly ? 1 : 0) +
    (f.videoOnly ? 1 : 0) +
    (f.recentOnly ? 1 : 0) +
    (f.beachMax != null ? 1 : 0) +
    (f.from && f.to ? 1 : 0)
  );
}

/**
 * Cambia la operación y limpia lo que sólo tiene sentido con la anterior. Un precio en dólares de una venta, uno por mes de un
 * alquiler y uno por noche de un temporal no se parecen en nada: el rango de precio (y su moneda) pertenece a UNA operación,
 * así que al cambiarla se descarta. Y las fechas libres sólo valen para alquileres: una venta no se alquila.
 */
export function withOperation(f: PropertyFiltersState, operation: PropertyFiltersState["operation"]): PropertyFiltersState {
  if (operation === f.operation) return f;
  return { ...f, operation, currency: null, priceMin: null, priceMax: null, ...(operation === "venta" ? { from: null, to: null } : {}) };
}

/** Construye los query params compartidos (sin bbox/page) a partir del estado de filtros. Es también la dirección que se comparte. */
export function filtersToSearchParams(filters: PropertyFiltersState): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.q.trim()) p.set("q", filters.q.trim());
  if (filters.operation !== "todas") p.set("operation", filters.operation);
  if (filters.types.length > 0) p.set("type", filters.types.join(","));
  // La moneda sólo tiene sentido acompañando a un rango de precio: sola no restringe nada (y no debe quedar viajando oculta).
  // El precio sólo viaja con una operación elegida (un monto por noche no se compara con uno de venta): sin ella no hay rango.
  const priced = filters.operation !== "todas";
  if (priced && filters.currency && (filters.priceMin != null || filters.priceMax != null)) p.set("currency", filters.currency);
  if (priced && filters.priceMin != null) p.set("priceMin", String(filters.priceMin));
  if (priced && filters.priceMax != null) p.set("priceMax", String(filters.priceMax));
  if (filters.minRooms) p.set("minRooms", String(filters.minRooms));
  if (filters.minBedrooms) p.set("minBedrooms", String(filters.minBedrooms));
  if (filters.minBathrooms) p.set("minBathrooms", String(filters.minBathrooms));
  if (filters.minGarages) p.set("minGarages", String(filters.minGarages));
  if (filters.areaMin != null) p.set("areaMin", String(filters.areaMin));
  if (filters.areaMax != null) p.set("areaMax", String(filters.areaMax));
  if (filters.amenities.length > 0) p.set("amenities", filters.amenities.join(","));
  if (filters.city) p.set("city", filters.city);
  if (filters.neighborhood) p.set("neighborhood", filters.neighborhood);
  if (filters.tour3dOnly) p.set("tour3d", "true");
  if (filters.ambientOnly) p.set("ambient", "true");
  if (filters.videoOnly) p.set("videos", "true");
  if (filters.recentOnly) p.set("recent", "true");
  if (filters.beachMax != null) p.set("beach", String(filters.beachMax));
  if (filters.from && filters.to) {
    p.set("from", filters.from);
    p.set("to", filters.to);
  }
  if (filters.agencyId) p.set("agencyId", filters.agencyId);
  return p;
}

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

/**
 * Lo inverso de `filtersToSearchParams`: arma el estado a partir de una dirección (`?type=casa&operation=venta…`). Lo que no se
 * reconoce o está fuera de rango se descarta en silencio —una dirección vieja o a mano nunca rompe la pantalla—.
 */
export function parseFilters(source: ParamSource): PropertyFiltersState {
  const get = (key: string): string | undefined => {
    if (source instanceof URLSearchParams) return source.get(key) ?? undefined;
    const v = source[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const num = (key: string, min: number, max: number): number | null => {
    const raw = get(key);
    if (raw == null || raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  };
  const int = (key: string, min: number, max: number): number | null => {
    const n = num(key, min, max);
    return n == null ? null : Math.floor(n);
  };
  const list = <T extends string>(key: string, allowed: readonly T[]): T[] => {
    const raw = get(key);
    if (!raw) return [];
    return [...new Set(raw.split(",").map((s) => s.trim()))].filter((s): s is T => (allowed as readonly string[]).includes(s));
  };
  const text = (key: string, max = 80): string | null => {
    const raw = get(key)?.trim();
    return raw ? raw.slice(0, max) : null;
  };
  const flag = (key: string) => get(key) === "true";

  const op = get("operation");
  const currency = get("currency");
  const priceMin = num("priceMin", 0, 1e12);
  const priceMax = num("priceMax", 0, 1e12);
  const areaMin = num("areaMin", 0, 1e6);
  const areaMax = num("areaMax", 0, 1e6);
  const agency = get("agencyId") ?? get("agency");
  const operation = (OPERATIONS as readonly string[]).includes(op ?? "") ? (op as Operation) : "todas";
  // Las fechas valen juntas, bien ordenadas, y sólo para alquileres.
  const fromRaw = get("from")?.trim() ?? "";
  const toRaw = get("to")?.trim() ?? "";
  const datesOk = operation !== "venta" && !!fromRaw && !!toRaw && checkRange({ from: fromRaw, to: toRaw }) === null;
  // Sin una operación elegida no hay rango de precio (ver `withOperation`).
  const priced = operation !== "todas";
  return {
    q: (get("q") ?? "").trim().slice(0, 100),
    operation,
    types: list("type", PROPERTY_TYPES),
    currency: priced && (CURRENCIES as readonly string[]).includes(currency ?? "") ? (currency as Currency) : null,
    priceMin: priced ? priceMin : null,
    priceMax: priced && !(priceMax != null && priceMin != null && priceMax < priceMin) ? priceMax : null,
    minRooms: int("minRooms", 1, 20),
    minBedrooms: int("minBedrooms", 1, 20),
    minBathrooms: int("minBathrooms", 1, 20),
    minGarages: int("minGarages", 1, 20),
    areaMin,
    areaMax: areaMax != null && areaMin != null && areaMax < areaMin ? null : areaMax,
    amenities: list("amenities", AMENITIES),
    city: text("city"),
    neighborhood: text("neighborhood"),
    tour3dOnly: flag("tour3d"),
    ambientOnly: flag("ambient"),
    videoOnly: flag("videos"),
    recentOnly: flag("recent"),
    beachMax: int("beach", 0, 20_000),
    from: datesOk ? fromRaw : null,
    to: datesOk ? toRaw : null,
    agencyId: agency && /^[a-f0-9]{24}$/i.test(agency) ? agency : null,
  };
}

/** Un filtro activo como etiqueta que se puede quitar con un toque, y qué estado queda al quitarlo. */
export type FilterChip = { id: string; label: string; clear: (f: PropertyFiltersState) => PropertyFiltersState };

/** "US$ 100k – 300k", "desde US$ 100k", "hasta $ 5M". */
function priceChip(f: PropertyFiltersState): string {
  const symbol = f.currency ? (CURRENCY_SYMBOLS[f.currency] ?? f.currency) : "";
  const short = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : n >= 1_000 ? `${Math.round(n / 1000)}k` : String(n));
  const unit = f.operation === "alquiler_temporal" ? " por noche" : f.operation === "alquiler" ? " por mes" : "";
  if (f.priceMin != null && f.priceMax != null) return `${symbol} ${short(f.priceMin)} – ${short(f.priceMax)}${unit}`.trim();
  if (f.priceMin != null) return `Desde ${symbol} ${short(f.priceMin)}${unit}`.replace("  ", " ");
  return `Hasta ${symbol} ${short(f.priceMax ?? 0)}${unit}`.replace("  ", " ");
}

/** Los filtros activos como etiquetas removibles, en el mismo orden en que aparecen en la hoja de filtros. */
export function activeChips(f: PropertyFiltersState): FilterChip[] {
  const chips: FilterChip[] = [];
  const text = f.q.trim();
  if (text) chips.push({ id: "q", label: `Texto: ${text.length > 24 ? `${text.slice(0, 23)}…` : text}`, clear: (s) => ({ ...s, q: "" }) });
  // Quitar la operación quita también el rango de precio: el precio pertenece a UNA operación (ver `withOperation`).
  if (f.operation !== "todas") chips.push({ id: "operation", label: OPERATION_LABELS[f.operation], clear: (s) => withOperation(s, "todas") });
  for (const t of f.types) chips.push({ id: `type:${t}`, label: PROPERTY_TYPE_LABELS[t], clear: (s) => ({ ...s, types: s.types.filter((x) => x !== t) }) });
  if (f.neighborhood || f.city) {
    chips.push({ id: "place", label: [f.neighborhood, f.city].filter(Boolean).join(", "), clear: (s) => ({ ...s, city: null, neighborhood: null }) });
  }
  if (f.priceMin != null || f.priceMax != null) {
    // Quitar el precio quita también la moneda: si no, quedaría una restricción que ya no se ve en ninguna etiqueta.
    chips.push({ id: "price", label: priceChip(f), clear: (s) => ({ ...s, currency: null, priceMin: null, priceMax: null }) });
  }
  if (f.minRooms) chips.push({ id: "rooms", label: `${f.minRooms}+ ambientes`, clear: (s) => ({ ...s, minRooms: null }) });
  if (f.minBedrooms) chips.push({ id: "bedrooms", label: `${f.minBedrooms}+ dormitorios`, clear: (s) => ({ ...s, minBedrooms: null }) });
  if (f.minBathrooms) chips.push({ id: "bathrooms", label: `${f.minBathrooms}+ baños`, clear: (s) => ({ ...s, minBathrooms: null }) });
  if (f.minGarages) chips.push({ id: "garages", label: `${f.minGarages}+ cocheras`, clear: (s) => ({ ...s, minGarages: null }) });
  if (f.areaMin != null || f.areaMax != null) {
    const label = f.areaMin != null && f.areaMax != null ? `${f.areaMin} – ${f.areaMax} m²` : f.areaMin != null ? `Desde ${f.areaMin} m²` : `Hasta ${f.areaMax} m²`;
    chips.push({ id: "area", label, clear: (s) => ({ ...s, areaMin: null, areaMax: null }) });
  }
  for (const a of f.amenities) chips.push({ id: `amenity:${a}`, label: AMENITY_LABELS[a], clear: (s) => ({ ...s, amenities: s.amenities.filter((x) => x !== a) }) });
  if (f.tour3dOnly) chips.push({ id: "tour", label: "Con recorrido 360°", clear: (s) => ({ ...s, tour3dOnly: false }) });
  if (f.ambientOnly) chips.push({ id: "ambient", label: "Con portada viva", clear: (s) => ({ ...s, ambientOnly: false }) });
  if (f.videoOnly) chips.push({ id: "video", label: "Con video", clear: (s) => ({ ...s, videoOnly: false }) });
  if (f.recentOnly) chips.push({ id: "recent", label: "Publicadas hace poco", clear: (s) => ({ ...s, recentOnly: false }) });
  if (f.beachMax != null) chips.push({ id: "beach", label: f.beachMax === 0 ? "Frente al mar" : `Hasta ${f.beachMax >= 1000 ? `${f.beachMax / 1000} km` : `${f.beachMax} m`} de la playa`, clear: (s) => ({ ...s, beachMax: null }) });
  if (f.from && f.to) chips.push({ id: "dates", label: f.from === f.to ? `Libre el ${formatDay(f.from)}` : `Libre del ${formatDay(f.from)} al ${formatDay(f.to)}`, clear: (s) => ({ ...s, from: null, to: null }) });
  return chips;
}

/** El mismo estado sin lo que no se comparte entre pantallas por dirección (nada hoy: se deja por si se suma algo local). */
export const filtersEqual = (a: PropertyFiltersState, b: PropertyFiltersState): boolean => filtersToSearchParams(a).toString() === filtersToSearchParams(b).toString();
