"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MapLibreMap } from "maplibre-gl";
import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { UserMenu } from "@/components/auth/UserMenu";
import { Skeleton } from "@/components/ui/Skeleton";
import { MapFilters } from "@/components/map/MapFilters";
import { MapControls } from "@/components/map/MapControls";
import { ResultsPanel } from "@/components/map/ResultsPanel";
import { DEFAULT_FILTERS, type MapFiltersState } from "@/components/map/types";
import { filtersToSearchParams } from "@/lib/filters/state";
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
  const [bounds, setBounds] = useState<{ bbox: BBox; zoom: number } | null>(null);
  const [features, setFeatures] = useState<PropertyFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const handleBoundsChange = useCallback((bbox: BBox, zoom: number) => {
    setBounds({ bbox, zoom });
  }, []);

  useEffect(() => {
    if (!bounds) return;
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
    }, 300);
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
            <MapFilters value={filters} onChange={setFilters} resultCount={properties.length} />
          </div>
          <div className="pointer-events-auto hidden shrink-0 items-center gap-2 rounded-pill bg-surface/90 p-1 shadow-pop backdrop-blur-md sm:flex">
            <div className="pl-1.5">
              <UserMenu compact />
            </div>
            <ThemeToggle />
          </div>
        </div>

        <MapControls map={mapInstance} className="absolute bottom-6 right-4 z-20" />
      </div>
    </div>
  );
}
