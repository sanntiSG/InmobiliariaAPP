import type { Operation, PropertyType } from "@/config/filters";

export type MapFiltersState = {
  q: string;
  operation: Operation | "todas";
  types: PropertyType[];
  priceRange: [number, number];
  minRooms: number | null;
  tour3dOnly: boolean;
};

export const PRICE_BOUNDS: [number, number] = [0, 1_000_000];

export const DEFAULT_FILTERS: MapFiltersState = {
  q: "",
  operation: "todas",
  types: [],
  priceRange: PRICE_BOUNDS,
  minRooms: null,
  tour3dOnly: false,
};

/** Cuenta filtros "avanzados" activos, para el badge del chip "Filtros". */
export function countActiveFilters(f: MapFiltersState): number {
  let n = 0;
  if (f.types.length > 0) n++;
  if (f.priceRange[0] !== PRICE_BOUNDS[0] || f.priceRange[1] !== PRICE_BOUNDS[1]) n++;
  if (f.minRooms) n++;
  return n;
}
