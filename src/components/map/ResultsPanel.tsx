"use client";

import { useState } from "react";
import type { MapLibreMap } from "maplibre-gl";
import { PropertyCard } from "@/components/property/PropertyCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { MAP_DEFAULTS } from "@/config/site";
import type { PropertyCardData } from "@/components/property/types";

type Props = {
  properties: PropertyCardData[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  hoveredId: string | null;
  onHoverChange: (id: string | null) => void;
  /** Instancia del mapa — se usa solo para el botón "volver a donde hay propiedades". */
  map: MapLibreMap | null;
};

/**
 * Panel de resultados: aside fijo en desktop, drawer accesible por botón
 * flotante en mobile (ver plan — versión no arrastrable de esta sesión,
 * el Sheet ya trae su propio affordance de "agarre").
 */
export function ResultsPanel({ properties, loading, selectedId, onSelect, hoveredId, onHoverChange, map }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

  function recenter() {
    map?.flyTo({ center: MAP_DEFAULTS.center, zoom: MAP_DEFAULTS.zoom, duration: 800 });
  }

  const list = loading ? (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3">
          <Skeleton className="aspect-[4/3] w-full" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-36" />
        </div>
      ))}
    </div>
  ) : properties.length === 0 ? (
    <div className="flex flex-col items-center gap-3 py-16 text-center text-text-muted">
      <p className="font-display text-base font-semibold text-text">No hay propiedades acá</p>
      <p className="max-w-[220px] text-sm">
        Movete por el mapa, probá con otros filtros, o mirá dónde está la mayoría.
      </p>
      <Button variant="secondary" size="sm" onClick={recenter}>
        Ver dónde hay más propiedades
      </Button>
    </div>
  ) : (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-1">
      {properties.map((p) => (
        <PropertyCard
          key={p.id}
          property={p}
          selected={p.id === selectedId}
          onSelect={onSelect}
          onHoverChange={onHoverChange}
          className={hoveredId === p.id ? "-translate-y-0.5 shadow-float" : undefined}
        />
      ))}
    </div>
  );

  return (
    <>
      {/* Desktop: aside fijo */}
      <aside className="hidden md:flex md:w-[380px] md:shrink-0 md:flex-col md:overflow-y-auto md:bg-bg md:p-4">
        {list}
      </aside>

      {/* Mobile: botón flotante + drawer */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[calc(env(safe-area-inset-bottom)+16px)] md:hidden">
        <Button onClick={() => setMobileOpen(true)} className="pointer-events-auto shadow-float">
          {loading ? "Buscando…" : `Ver ${properties.length} propiedades`}
        </Button>
      </div>
      <Sheet open={mobileOpen} onClose={() => setMobileOpen(false)} title="Propiedades" side="bottom">
        {list}
      </Sheet>
    </>
  );
}
