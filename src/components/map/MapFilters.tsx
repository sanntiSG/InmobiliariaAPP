"use client";

import { useState } from "react";
import { FilterPill } from "@/components/ui/FilterPill";
import { Input } from "@/components/ui/Input";
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
}: {
  value: MapFiltersState;
  onChange: (next: MapFiltersState) => void;
  resultCount?: number;
  className?: string;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
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

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative shrink-0 sm:w-64">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <Input
          value={value.q}
          onChange={(e) => onChange({ ...value, q: e.target.value })}
          placeholder="Barrio, ciudad..."
          aria-label="Buscar por ubicación"
          className="pl-10"
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
              onClick={() => onChange(DEFAULT_FILTERS)}
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

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m21 21-4.3-4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
