/**
 * Re-exporta el estado de filtros compartido (ver src/lib/filters/state.ts,
 * usado también por /propiedades) bajo los nombres históricos de este
 * módulo, para no tocar los imports existentes de MapFilters/ResultsPanel.
 */
export {
  DEFAULT_FILTERS,
  activeChips,
  parseFilters,
  RECENT_DAYS,
  countActiveFilters,
  filtersToSearchParams,
  type FilterChip,
  type PropertyFiltersState as MapFiltersState,
} from "@/lib/filters/state";
