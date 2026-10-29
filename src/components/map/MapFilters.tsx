"use client";

import { useState } from "react";
import Link from "next/link";
import { List, Search } from "lucide-react";
import { FilterSheet } from "@/components/filters/FilterSheet";
import { FilterPill, filterPillClassName } from "@/components/ui/FilterPill";
import { AddressSearch, type GeocodeResult } from "@/components/ui/AddressSearch";
import { cn } from "@/lib/utils/cn";
import { countActiveFilters, type MapFiltersState } from "./types";

/**
 * La barra de búsqueda y filtros del mapa y del listado: un buscador de zona o dirección, el botón "Filtros" (todo lo demás vive
 * en su hoja, ver `FilterSheet`) y, donde se pasa `listHref`, el atajo "Lista" a todas las propiedades. Antes había además
 * botones sueltos de operación y de recorrido 3D: ocupaban lugar en la pantalla del mapa y ahora están dentro de "Filtros".
 */
export function MapFilters({
  value,
  onChange,
  resultCount,
  className,
  /** Se dispara al elegir una sugerencia de dirección — el llamador decide qué hacer (ej: recentrar el mapa). */
  onLocationSelect,
  /** Si viene, se muestra "Lista" y lleva a esta dirección (el listado con los mismos filtros). */
  listHref,
  /** Centro del mapa y cómo ir a otra zona: sólo en el mapa; con ellos los resultados vacíos ofrecen "la zona más cercana". */
  center,
  onFlyTo,
}: {
  value: MapFiltersState;
  onChange: (next: MapFiltersState) => void;
  resultCount?: number;
  className?: string;
  onLocationSelect?: (result: GeocodeResult) => void;
  listHref?: string;
  center?: { lng: number; lat: number } | null;
  onFlyTo?: (lng: number, lat: number) => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const activeCount = countActiveFilters(value);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden />
        <AddressSearch
          initialValue={value.q}
          syncValue={value.q}
          onQueryChange={(text) => onChange({ ...value, q: text })}
          onSelect={(result) => onLocationSelect?.(result)}
          placeholder="Barrio, ciudad o dirección..."
          inputClassName="pl-10"
        />
      </div>

      <FilterPill active={activeCount > 0} count={activeCount} onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
        Filtros
      </FilterPill>

      {listHref && (
        <Link href={listHref} className={filterPillClassName(false)} aria-label="Ver todas las propiedades en una lista">
          <List className="h-4 w-4" aria-hidden />
          Lista
        </Link>
      )}

      <FilterSheet open={sheetOpen} onClose={() => setSheetOpen(false)} value={value} onChange={onChange} resultCount={resultCount} center={center} onFlyTo={onFlyTo} />
    </div>
  );
}
