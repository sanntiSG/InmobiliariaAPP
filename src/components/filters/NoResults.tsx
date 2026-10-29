"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, MapPin, SearchX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { filterPillClassName } from "@/components/ui/FilterPill";
import type { AlternativesResponse } from "@/lib/filters/alternatives";
import { DEFAULT_FILTERS, activeChips, filtersToSearchParams, type PropertyFiltersState } from "@/lib/filters/state";
import { cn } from "@/lib/utils/cn";

type Props = {
  filters: PropertyFiltersState;
  onChange: (next: PropertyFiltersState) => void;
  /** Centro del mapa: con él se ofrece "la zona más cercana donde sí hay". Sin él (el listado) la búsqueda no depende de una zona. */
  center?: { lng: number; lat: number } | null;
  /** Llevar el mapa a esa zona. */
  onFlyTo?: (lng: number, lat: number) => void;
  /** Más chico, para ir dentro del panel de filtros. */
  compact?: boolean;
  className?: string;
};

const plural = (n: number) => `${n} ${n === 1 ? "propiedad" : "propiedades"}`;
const distance = (km: number) => (km < 1 ? "a menos de 1 km" : km < 10 ? `a ${km.toFixed(1).replace(".", ",")} km` : `a ${Math.round(km)} km`);

/**
 * Lo que se ve cuando los filtros no dan resultados: en vez de "Ver 0 propiedades" (que parece un error), dice qué pasó y ofrece
 * caminos —la zona más cercana donde sí hay, o qué filtro conviene quitar con cuántas quedarían—. Las sugerencias se piden al
 * servidor (`/api/properties/alternatives`) y se aplican con el mismo `chip.clear` que las etiquetas de la hoja de filtros.
 */
export function NoResults({ filters, onChange, center, onFlyTo, compact = false, className }: Props) {
  const zone = !!center;
  const chips = activeChips(filters);
  const hasFilters = chips.length > 0;

  // Una sola clave para la consulta: sólo se vuelve a pedir si cambian los filtros o el centro (redondeado: moverse un poco no cuenta).
  const qs = useMemo(() => {
    const p = filtersToSearchParams(filters);
    if (center) {
      p.set("lng", center.lng.toFixed(2));
      p.set("lat", center.lat.toFixed(2));
    }
    return p.toString();
  }, [filters, center]);

  const [state, setState] = useState<{ qs: string; data: AlternativesResponse | null }>({ qs: "", data: null });
  useEffect(() => {
    const ctrl = new AbortController();
    // Espera un momento: mientras alguien mueve un deslizador o escribe, no se pide una sugerencia por cada cambio.
    const timer = setTimeout(() => {
      fetch(`/api/properties/alternatives?${qs}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<AlternativesResponse>) : Promise.reject(new Error("alternatives"))))
        .then((data) => setState({ qs, data }))
        .catch((err) => {
          if ((err as Error).name !== "AbortError") setState({ qs, data: null });
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [qs]);

  const settled = state.qs === qs;
  const data = settled ? state.data : null;
  const nearest = zone ? data?.nearest : null;
  const relax = data?.relax ?? [];
  const place = nearest ? [nearest.neighborhood, nearest.city].filter(Boolean).join(", ") : "";

  const remove = (chipId: string) => {
    const chip = chips.find((c) => c.id === chipId);
    if (chip) onChange(chip.clear(filters));
  };

  const title = hasFilters ? (zone ? "Nada con estos filtros en esta zona" : "No encontramos propiedades con estos filtros") : "Todavía no hay propiedades en esta zona";
  const hint = relax.length > 0 || nearest ? "Mirá estas opciones:" : hasFilters ? "Probá quitando algún filtro." : "Movete por el mapa para ver otras zonas.";

  return (
    <div className={cn("rise-group flex flex-col items-center text-center", compact ? "gap-3 py-2" : "gap-4 py-12", className)} role="status" aria-live="polite">
      <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-text-muted" aria-hidden>
        <SearchX className="h-5 w-5" />
      </span>

      <div className="flex flex-col gap-1">
        <p className="font-display text-base font-semibold text-text">{title}</p>
        <p className="max-w-[280px] text-sm text-text-muted">{hint}</p>
      </div>

      {nearest && onFlyTo && (
        <button
          type="button"
          onClick={() => onFlyTo(nearest.lng, nearest.lat)}
          className="group flex w-full max-w-[320px] items-center gap-3 rounded-card border border-border bg-surface-2 p-3 text-left transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-out)] hover:bg-surface-3 active:scale-[0.98]"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent" aria-hidden>
            <MapPin className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 block text-sm font-semibold leading-snug text-text">
              Hay {plural(nearest.count)} en {place || "otra zona"}
            </span>
            <span className="block text-xs text-text-muted">{distance(nearest.distanceKm)} de acá · tocá para ir</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
        </button>
      )}

      {relax.length > 0 && (
        <ul className="flex max-w-[360px] flex-wrap justify-center gap-2" aria-label="Qué filtro quitar">
          {relax.map((r) => (
            <li key={r.chipId}>
              <button
                type="button"
                onClick={() => remove(r.chipId)}
                aria-label={`Quitar ${r.label}: ${plural(r.count)}`}
                className={filterPillClassName(false, "h-9 max-w-full gap-2 px-3 text-[13px] pointer-coarse:h-11")}
              >
                <span className="truncate">Sin {r.label}</span>
                <span className="font-mono text-xs text-accent">{r.count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Dentro del panel de filtros "Limpiar filtros" ya está en el pie: no se repite. */}
      {hasFilters && !compact && (
        <Button variant="ghost" size="sm" onClick={() => onChange({ ...DEFAULT_FILTERS, agencyId: filters.agencyId })}>
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}
