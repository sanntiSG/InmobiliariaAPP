"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { FilterPill } from "@/components/ui/FilterPill";
import { AddressSearch, type GeocodeResult } from "@/components/ui/AddressSearch";
import { RangeSlider } from "@/components/ui/RangeSlider";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { OPERATIONS, OPERATION_LABELS, PROPERTY_TYPES, PROPERTY_TYPE_LABELS } from "@/config/filters";
import { formatPriceCompact } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { DEFAULT_FILTERS, PRICE_BOUNDS, countActiveFilters, type MapFiltersState } from "./types";

const OPERATION_CYCLE: MapFiltersState["operation"][] = ["todas", ...OPERATIONS];

export function MapFilters({
  value,
  onChange,
  resultCount,
  className,
  /** Se dispara al elegir una sugerencia de dirección — el llamador decide qué hacer (ej: recentrar el mapa). */
  onLocationSelect,
}: {
  value: MapFiltersState;
  onChange: (next: MapFiltersState) => void;
  resultCount?: number;
  className?: string;
  onLocationSelect?: (result: GeocodeResult) => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchResetKey, setSearchResetKey] = useState(0);
  const activeCount = countActiveFilters(value);

  function cycleOperation() {
    const i = OPERATION_CYCLE.indexOf(value.operation);
    onChange({ ...value, operation: OPERATION_CYCLE[(i + 1) % OPERATION_CYCLE.length] });
  }

  function toggleType(type: (typeof PROPERTY_TYPES)[number]) {
    const set = new Set(value.types);
    if (set.has(type)) set.delete(type);
    else set.add(type);
    onChange({ ...value, types: Array.from(set) });
  }

  function clearFilters() {
    onChange(DEFAULT_FILTERS);
    setSearchResetKey((k) => k + 1); // fuerza a remontar el buscador y limpiar su texto
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative shrink-0 sm:w-64">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-text-muted"
          aria-hidden
        />
        <AddressSearch
          key={searchResetKey}
          initialValue={value.q}
          onQueryChange={(text) => onChange({ ...value, q: text })}
          onSelect={(result) => onLocationSelect?.(result)}
          placeholder="Barrio, ciudad o dirección..."
          inputClassName="pl-10"
        />
      </div>

      <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <FilterPill active={value.operation !== "todas"} onClick={cycleOperation}>
          {value.operation === "todas" ? "Operación" : OPERATION_LABELS[value.operation]}
        </FilterPill>
        <FilterPill
          active={value.tour3dOnly}
          onClick={() => onChange({ ...value, tour3dOnly: !value.tour3dOnly })}
        >
          Con recorrido 3D
        </FilterPill>
        <FilterPill active={activeCount > 0} count={activeCount} onClick={() => setSheetOpen(true)}>
          Filtros
        </FilterPill>
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Filtros" side="bottom">
        <div className="flex flex-col gap-7 pt-1">
          <section>
            <h3 className="mb-3 text-sm font-semibold text-text">Tipo de propiedad</h3>
            <div className="flex flex-wrap gap-2">
              {PROPERTY_TYPES.map((type) => (
                <FilterPill key={type} active={value.types.includes(type)} onClick={() => toggleType(type)}>
                  {PROPERTY_TYPE_LABELS[type]}
                </FilterPill>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-text">Precio</h3>
            <RangeSlider
              min={PRICE_BOUNDS[0]}
              max={PRICE_BOUNDS[1]}
              step={5000}
              value={value.priceRange}
              onChange={(priceRange) => onChange({ ...value, priceRange })}
              formatValue={(n) => (n >= PRICE_BOUNDS[1] ? `${formatPriceCompact(n)}+` : formatPriceCompact(n))}
            />
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-text">Ambientes mínimos</h3>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <FilterPill
                  key={n}
                  active={value.minRooms === n}
                  onClick={() => onChange({ ...value, minRooms: value.minRooms === n ? null : n })}
                >
                  {n}+ amb.
                </FilterPill>
              ))}
            </div>
          </section>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <button
              onClick={clearFilters}
              className="text-sm font-medium text-text-muted underline-offset-2 hover:text-text hover:underline"
            >
              Limpiar filtros
            </button>
            <Button size="sm" onClick={() => setSheetOpen(false)}>
              {resultCount != null ? `Ver ${resultCount} propiedades` : "Ver resultados"}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
