import type { Operation, PropertyType } from "@/config/filters";

/** Estado de filtros compartido entre /mapa y /propiedades. */
export type PropertyFiltersState = {
  q: string;
  operation: Operation | "todas";
  types: PropertyType[];
  priceRange: [number, number];
  minRooms: number | null;
  tour3dOnly: boolean;
};

export const PRICE_BOUNDS: [number, number] = [0, 1_000_000];

export const DEFAULT_FILTERS: PropertyFiltersState = {
  q: "",
  operation: "todas",
  types: [],
  priceRange: PRICE_BOUNDS,
  minRooms: null,
  tour3dOnly: false,
};

/** Cuenta filtros "avanzados" activos, para el badge del chip "Filtros". */
export function countActiveFilters(f: PropertyFiltersState): number {
  let n = 0;
  if (f.types.length > 0) n++;
  if (f.priceRange[0] !== PRICE_BOUNDS[0] || f.priceRange[1] !== PRICE_BOUNDS[1]) n++;
  if (f.minRooms) n++;
  return n;
}

/** Construye los query params compartidos (sin bbox/page) a partir del estado de filtros. */
export function filtersToSearchParams(filters: PropertyFiltersState): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.operation !== "todas") params.set("operation", filters.operation);
  if (filters.types.length > 0) params.set("type", filters.types.join(","));
  if (filters.priceRange[0] !== PRICE_BOUNDS[0]) params.set("priceMin", String(filters.priceRange[0]));
  if (filters.priceRange[1] !== PRICE_BOUNDS[1]) params.set("priceMax", String(filters.priceRange[1]));
  if (filters.minRooms) params.set("minRooms", String(filters.minRooms));
  if (filters.tour3dOnly) params.set("tour3d", "true");
  return params;
}
