"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { padBBox, bboxContains, type BBox } from "@/lib/map/geo";

const MapCanvas = dynamic(() => import("@/components/map/MapCanvas").then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => <Skeleton className="absolute inset-0 rounded-none" />,
});

/** Cuánto se expande el bbox pedido más allá del viewport visible — mientras
 * el usuario se mueva dentro de ese margen no hace falta un fetch nuevo. */
const FETCH_PAD_RATIO = 0.3;
/** Tope de cards renderizadas en el panel de resultados a la vez. */
const MAX_LIST_ITEMS = 50;

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
  // Viewport real (sin padding) — se usa solo para filtrar qué mostrar, no
  // para decidir cuándo refetchear (eso lo decide `bounds`, más arriba).
  const [viewport, setViewport] = useState<{ bbox: BBox; zoom: number }>({
    bbox: MAP_DEFAULTS.bounds,
    zoom: MAP_DEFAULTS.zoom,
  });
  const [features, setFeatures] = useState<PropertyFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const isFirstFetchRef = useRef(true);
  // bbox (ya con padding) del último fetch que efectivamente completó. Mientras
  // el viewport siga adentro, no hace falta pedir de nuevo.
  const fetchedBBoxRef = useRef<BBox | null>(null);

  const handleBoundsChange = useCallback((bbox: BBox, zoom: number) => {
    setViewport({ bbox, zoom });
    const fetched = fetchedBBoxRef.current;
    if (fetched && bboxContains(fetched, bbox)) return;
    setBounds({ bbox: padBBox(bbox, FETCH_PAD_RATIO), zoom });
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
          setLoadError(false);
          setLoading(false);
          fetchedBBoxRef.current = bounds.bbox;
        })
        .catch((err) => {
          if (err.name === "AbortError") return;
          // Importante: NO vaciamos `features` acá. Si la falla es transitoria
          // (ej. la DB tardó en despertar) preferimos seguir mostrando los
          // pines/cards que ya teníamos antes que un mapa vacío, y marcamos el
          // error aparte para que el panel lo distinga de "no hay propiedades".
          setLoadError(true);
          setLoading(false);
        });
    }, delay);
    return () => clearTimeout(timeout);
  }, [bounds, filters]);

  // Filtra al viewport visible real (no al bbox con padding que se pidió al
  // servidor) — así el contador y la lista nunca muestran algo que en
  // realidad está fuera de pantalla.
  const properties = useMemo(() => {
    const { bbox } = viewport;
    return features
      .map((f) => f.properties)
      .filter((p) => p.lng >= bbox.west && p.lng <= bbox.east && p.lat >= bbox.south && p.lat <= bbox.north);
  }, [features, viewport]);

  const visibleProperties = properties.slice(0, MAX_LIST_ITEMS);
  const truncatedCount = properties.length - visibleProperties.length;

  const handleSelect = useCallback((id: string) => setSelectedId((cur) => (cur === id ? null : id)), []);

  return (
    // El mapa es la aplicación, no una sección (ver .impeccable.md): ocupa
    // toda la pantalla y todo lo demás (top bar, panel de resultados,
    // controles) flota encima con overlays absolutos, en vez de empujarlo a
    // un `flex-1` que le come espacio real.
    <div className="fixed inset-0">
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

      <ResultsPanel
        properties={visibleProperties}
        truncatedCount={truncatedCount}
        loading={loading}
        error={loadError}
        selectedId={selectedId}
        onSelect={handleSelect}
        hoveredId={hoveredId}
        onHoverChange={setHoveredId}
        map={mapInstance}
      />

      <MapControls map={mapInstance} className="absolute bottom-6 right-4 z-20" />
    </div>
  );
}
