"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MapLibreMap } from "maplibre-gl";
import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { UserMenu } from "@/components/auth/UserMenu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Skeleton } from "@/components/ui/Skeleton";
import { MapFilters } from "@/components/map/MapFilters";
import { MapControls } from "@/components/map/MapControls";
import { ResultsPanel } from "@/components/map/ResultsPanel";
import { DEFAULT_FILTERS, type MapFiltersState } from "@/components/map/types";
import { filtersToSearchParams } from "@/lib/filters/state";
import { MAP_DEFAULTS } from "@/config/site";
import type { PropertyFeature } from "@/lib/map/useClusteredMarkers";
import type { BBox } from "@/lib/map/geo";

const MapCanvas = dynamic(() => import("@/components/map/MapCanvas").then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => <Skeleton className="absolute inset-0 rounded-none" />,
});

async function fetchProperties(bbox: BBox, filters: MapFiltersState, signal: AbortSignal) {
  const params = filtersToSearchParams(filters);
  params.set("bbox", `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`);
  params.set("limit", "300");

  const res = await fetch(`/api/map/properties?${params.toString()}`, { signal });
  if (!res.ok) throw new Error("No se pudieron cargar las propiedades");
  const data = await res.json();
  return data.features as PropertyFeature[];
}

export default function MapaPage() {
  const [filters, setFilters] = useState<MapFiltersState>(DEFAULT_FILTERS);
  // Arranca con el bbox por defecto (AMBA) en vez de null: así el primer
  // fetch de propiedades sale en paralelo con la descarga del bundle del
  // mapa (maplibre-gl es pesado) en vez de esperar a que el mapa termine
  // de cargar para recién ahí empezar a pedir datos — la lista y los pines
  // aparecen apenas responde la API, no cuando el mapa "decide" arrancar.
  const [bounds, setBounds] = useState<{ bbox: BBox; zoom: number }>({
    bbox: MAP_DEFAULTS.bounds,
    zoom: MAP_DEFAULTS.zoom,
  });
  const [features, setFeatures] = useState<PropertyFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const isFirstFetchRef = useRef(true);

  const handleBoundsChange = useCallback((bbox: BBox, zoom: number) => {
    setBounds({ bbox, zoom });
  }, []);

  useEffect(() => {
    // El fetch inicial no espera los 300ms de debounce (no hay nada que
    // debouncear todavía); solo los cambios posteriores (arrastrar el mapa,
    // tocar filtros) lo hacen.
    const delay = isFirstFetchRef.current ? 0 : 300;
    isFirstFetchRef.current = false;

    const timeout = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      fetchProperties(bounds.bbox, filters, controller.signal)
        .then((next) => {
          setFeatures(next);
          setLoading(false);
        })
        .catch((err) => {
          if (err.name !== "AbortError") setLoading(false);
        });
    }, delay);
    return () => clearTimeout(timeout);
  }, [bounds, filters]);

  const properties = features.map((f) => f.properties);
  const handleSelect = useCallback((id: string) => setSelectedId((cur) => (cur === id ? null : id)), []);

  return (
    <div className="fixed inset-0 flex">
      <ResultsPanel
        properties={properties}
        loading={loading}
        selectedId={selectedId}
        onSelect={handleSelect}
        hoveredId={hoveredId}
        onHoverChange={setHoveredId}
        map={mapInstance}
      />

      <div className="relative flex-1 overflow-hidden">
        <MapCanvas
          features={features}
          selectedId={selectedId}
          onSelectChange={setSelectedId}
          hoveredId={hoveredId}
          onHoverChange={setHoveredId}
          onBoundsChange={handleBoundsChange}
          onMapReady={setMapInstance}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="pointer-events-auto flex shrink-0 items-center gap-2 rounded-pill bg-surface/90 px-3.5 py-2.5 shadow-pop backdrop-blur-md">
            <Logo href="/" />
          </div>
          <div className="pointer-events-auto flex-1 sm:max-w-2xl">
            <MapFilters
              value={filters}
              onChange={setFilters}
              resultCount={properties.length}
              onLocationSelect={(result) =>
                mapInstance?.flyTo({ center: [result.lng, result.lat], zoom: 15, duration: 800 })
              }
            />
          </div>
          <div className="pointer-events-auto hidden shrink-0 items-center gap-2 rounded-pill bg-surface/90 p-1 shadow-pop backdrop-blur-md sm:flex">
            <div className="pl-1.5">
              <UserMenu compact />
            </div>
            <NotificationBell />
            <ThemeToggle />
          </div>
        </div>

        <MapControls map={mapInstance} className="absolute bottom-6 right-4 z-20" />
      </div>
    </div>
  );
}
