/**
 * Cuando unos filtros no dan resultados, qué filtro conviene quitar: uno por cada etiqueta aplicada ("Sin «3+ dormitorios»"), con la
 * dirección que queda al quitarlo. Es la misma tabla de etiquetas que ya usa la pantalla (`activeChips`), así que quitar una etiqueta
 * en la sugerencia y quitarla en la hoja de filtros hace exactamente lo mismo (incluida la limpieza de lo que depende de ella: quitar la
 * operación también quita el precio). Módulo puro: sin base de datos ni red.
 */
import { activeChips, filtersToSearchParams, type PropertyFiltersState } from "./state";

export type RelaxCandidate = {
  /** Id de la etiqueta (`activeChips`): la pantalla lo usa para aplicar `chip.clear`. */
  chipId: string;
  /** "Texto: palermo", "3+ dormitorios"… */
  label: string;
  /** Cómo quedaría la búsqueda sin ese filtro (lo que se manda a contar). */
  params: string;
};

/** Hasta cuántas etiquetas se prueban: cada una cuesta un conteo en la base. */
export const MAX_RELAX = 8;

export function relaxCandidates(filters: PropertyFiltersState, max = MAX_RELAX): RelaxCandidate[] {
  return activeChips(filters)
    .slice(0, max)
    .map((chip) => ({ chipId: chip.id, label: chip.label, params: filtersToSearchParams(chip.clear(filters)).toString() }));
}
