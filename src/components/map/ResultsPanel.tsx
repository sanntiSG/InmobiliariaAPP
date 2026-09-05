"use client";

import { useRef, useState, type ReactNode } from "react";
import type { MapLibreMap } from "maplibre-gl";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { PropertyCard } from "@/components/property/PropertyCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { MAP_DEFAULTS } from "@/config/site";
import type { PropertyCardData } from "@/components/property/types";

type Props = {
  properties: PropertyCardData[];
  /** Cuántas propiedades más hay en el viewport además de las incluidas en `properties` (lista topeada). */
  truncatedCount?: number;
  loading: boolean;
  /** La API falló (ej. DB caída) — se muestra distinto de "no hay propiedades acá", que no es un error. */
  error?: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  hoveredId: string | null;
  onHoverChange: (id: string | null) => void;
  /** Instancia del mapa — se usa solo para el botón "volver a donde hay propiedades". */
  map: MapLibreMap | null;
};

/**
 * Panel de resultados flotante sobre el mapa full-bleed (el mapa ES la
 * aplicación — ver .impeccable.md): en desktop, una card que flota arriba a
 * la izquierda y se puede colapsar a una pill; en mobile, un botón flotante
 * que abre un drawer (Sheet) de abajo hacia arriba.
 */
export function ResultsPanel({
  properties,
  truncatedCount = 0,
  loading,
  error,
  selectedId,
  onSelect,
  hoveredId,
  onHoverChange,
  map,
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const totalCount = properties.length + truncatedCount;

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
  ) : error && properties.length === 0 ? (
    <div className="flex flex-col items-center gap-3 py-16 text-center text-text-muted">
      <p className="font-display text-base font-semibold text-text">No pudimos cargar las propiedades</p>
      <p className="max-w-[220px] text-sm">Revisá tu conexión e intentá de nuevo en un momento.</p>
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
      {properties.map((p, i) => (
        <PropertyCard
          key={p.id}
          property={p}
          selected={p.id === selectedId}
          onSelect={onSelect}
          onHoverChange={onHoverChange}
          priority={i < 4}
          className={hoveredId === p.id ? "-translate-y-0.5 shadow-float" : undefined}
        />
      ))}
      {truncatedCount > 0 && (
        <p className="col-span-full py-3 text-center text-sm text-text-muted">
          Mostrando {properties.length} de {totalCount} — acercá el mapa para ver el resto.
        </p>
      )}
    </div>
  );

  return (
    <>
      <DesktopPanel loading={loading} totalCount={totalCount} list={list} />

      {/* Mobile: botón flotante + drawer */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[calc(env(safe-area-inset-bottom)+16px)] md:hidden">
        <Button onClick={() => setMobileOpen(true)} className="pointer-events-auto shadow-float">
          {loading ? "Buscando…" : `Ver ${totalCount} propiedades`}
        </Button>
      </div>
      <Sheet open={mobileOpen} onClose={() => setMobileOpen(false)} title="Propiedades" side="bottom">
        {list}
      </Sheet>
    </>
  );
}

/**
 * Card flotante de escritorio, colapsable a una pill — nunca "aplasta" el
 * mapa como un aside sólido lo haría (ver .impeccable.md, principio 4).
 */
function DesktopPanel({ loading, totalCount, list }: { loading: boolean; totalCount: number; list: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion || !panelRef.current) return;
      gsap.fromTo(
        panelRef.current,
        { opacity: 0, y: 6, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.22, ease: "expo.out" }
      );
    },
    { scope: panelRef, dependencies: [collapsed] }
  );

  return (
    <div className="pointer-events-none absolute left-4 top-24 bottom-6 z-10 hidden md:block">
      <div ref={panelRef} className="pointer-events-auto h-full">
        {collapsed ? (
          <button
            onClick={() => setCollapsed(false)}
            className="flex h-12 items-center gap-2 rounded-pill bg-surface px-4 shadow-float transition-[transform,box-shadow] duration-150 [transition-timing-function:var(--ease-out)] hover:shadow-none active:scale-[0.97]"
          >
            <span className="text-sm font-medium text-text">
              {loading ? "Buscando…" : `${totalCount} propiedades`}
            </span>
            <ChevronIcon direction="right" />
          </button>
        ) : (
          <div className="flex h-full w-[360px] flex-col overflow-hidden rounded-card bg-surface shadow-float">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-medium text-text">
                {loading ? "Buscando…" : `${totalCount} propiedades`}
              </span>
              <IconButton variant="ghost" size={30} aria-label="Colapsar panel" onClick={() => setCollapsed(true)}>
                <ChevronIcon direction="left" />
              </IconButton>
            </div>
            <div className="flex-1 overflow-y-auto p-4">{list}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={direction === "left" ? "h-4 w-4" : "h-4 w-4 rotate-180"}
      aria-hidden
    >
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
