"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { MapLibreMap, Marker, Popup, AttributionControl } from "maplibre-gl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Button } from "@/components/ui/Button";
import { MAP_DEFAULTS, ARGENTINA_BOUNDS } from "@/config/site";
import { LIGHT_STYLE_URL, applyLightBrandTint } from "@/lib/map/style-light";
import { DARK_STYLE_URL, applyDarkBrandTint } from "@/lib/map/style-dark";
import { ensureMapLibreWorkerUrl } from "@/lib/map/worker-url";
import type { BBox } from "@/lib/map/geo";
import {
  useClusteredMarkers,
  isCluster,
  type PropertyFeature,
} from "@/lib/map/useClusteredMarkers";
import {
  createClusterElement,
  updateClusterElement,
  setClusterTarget,
  getClusterTarget,
  createPropertyPinElement,
  updatePropertyPinElement,
  setPinHighlighted,
} from "@/lib/map/markers";
import { PropertyPopupCard } from "./PropertyPopupCard";

type EffectiveTheme = "light" | "dark";

function getEffectiveTheme(): EffectiveTheme {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Padding sobre ARGENTINA_BOUNDS para el `maxBounds` del paneo — evita que
 * el borde del país quede pegado al borde del viewport. */
const MAX_BOUNDS_PADDING_DEG = 2;

const LOAD_TIMEOUT_MS = 8000;

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

export type MapCanvasProps = {
  features: PropertyFeature[];
  selectedId: string | null;
  onSelectChange: (id: string | null) => void;
  hoveredId: string | null;
  onHoverChange: (id: string | null) => void;
  onBoundsChange: (bbox: BBox, zoom: number) => void;
  onMapReady?: (map: MapLibreMap | null) => void;
};

export function MapCanvas({
  features,
  selectedId,
  onSelectChange,
  hoveredId,
  onHoverChange,
  onBoundsChange,
  onMapReady,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [webglSupported] = useState(() => supportsWebGL());
  const [mapError, setMapError] = useState(false);
  const [mapDegraded, setMapDegraded] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const markersRef = useRef(new Map<string, Marker>());
  const popupRef = useRef<{ popup: Popup; root: Root; container: HTMLDivElement } | null>(null);

  const { rendered, getExpansionZoom } = useClusteredMarkers(map, features);

  // ── Creación del mapa ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !webglSupported) return;
    setMapError(false);
    ensureMapLibreWorkerUrl();

    const instance = new MapLibreMap({
      container: containerRef.current,
      style: getEffectiveTheme() === "dark" ? DARK_STYLE_URL : LIGHT_STYLE_URL,
      center: MAP_DEFAULTS.center,
      zoom: MAP_DEFAULTS.zoom,
      minZoom: MAP_DEFAULTS.minZoom,
      maxZoom: MAP_DEFAULTS.maxZoom,
      attributionControl: false,
    });
    instance.addControl(new AttributionControl({ compact: true }), "bottom-right");

    // Publicamos la instancia YA, sin esperar a "load": los markers/popups de
    // MapLibre sólo dependen de la proyección (disponible desde el center/zoom
    // iniciales), no del estilo/tiles. Así los pins aparecen apenas hay datos,
    // en vez de esperar a que bajen los tiles — antes `setMap` sólo pasaba
    // dentro de "load" y una falla ahí dejaba el mapa en blanco para siempre.
    setMap(instance);
    onMapReady?.(instance);

    // El worker que decodifica tiles/glyphs (ver ensureMapLibreWorkerUrl)
    // termina su trabajo de forma asíncrona, y esa finalización no siempre
    // dispara un repaint por sí sola — el mapa se queda "cargado" pero
    // pintando solo el layer de fondo hasta el próximo evento que sí
    // fuerce un frame (mover el mapa, hacer zoom). triggerRepaint() en cada
    // "sourcedata" cierra ese hueco: pedimos un frame nuevo apenas llega
    // data nueva, en vez de esperar a que el usuario interactúe.
    instance.on("sourcedata", () => instance.triggerRepaint());

    const emitBounds = () => {
      const b = instance.getBounds();
      onBoundsChange(
        { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
        instance.getZoom()
      );
    };
    emitBounds();
    instance.on("moveend", emitBounds);

    // Click en el mapa vacío deselecciona (los pins están en elementos DOM
    // aparte y nunca disparan este evento — ver comentario en markers.ts).
    instance.on("click", () => onSelectChange(null));

    let loaded = false;

    instance.on("error", (e) => {
      console.error("MapLibre error:", e.error);
      // El evento "error" de MapLibre dispara también para fallas puntuales
      // y recuperables (un tile o un glyph que no bajó) — tratarlas todas
      // como fatales taparía el mapa entero por un hipo de red intrascendente.
      // Sólo lo mostramos como fatal si el mapa nunca llegó a cargar el
      // estilo inicial: eso sí es "el mapa no aparece".
      if (!loaded) setMapError(true);
    });

    const loadTimeout = setTimeout(() => {
      if (!loaded) setMapDegraded(true);
    }, LOAD_TIMEOUT_MS);

    instance.on("load", () => {
      loaded = true;
      clearTimeout(loadTimeout);
      setMapDegraded(false);
      if (getEffectiveTheme() === "light") applyLightBrandTint(instance);
      else applyDarkBrandTint(instance);
      // Acota el paneo a Argentina (con margen) recién acá: aplicarlo en el
      // constructor junto con minZoom obligaba a MapLibre a reconciliar un
      // viewport más ancho que el propio bound antes del primer render, y el
      // mapa quedaba en blanco.
      instance.setMaxBounds([
        [ARGENTINA_BOUNDS.west - MAX_BOUNDS_PADDING_DEG, ARGENTINA_BOUNDS.south - MAX_BOUNDS_PADDING_DEG],
        [ARGENTINA_BOUNDS.east + MAX_BOUNDS_PADDING_DEG, ARGENTINA_BOUNDS.north + MAX_BOUNDS_PADDING_DEG],
      ]);
    });

    // Redimensiona el canvas cuando el contenedor cambia de tamaño (ej: el
    // panel de resultados se colapsa/expande) — MapLibre no lo detecta solo
    // cuando el cambio viene del layout, no de la ventana.
    const resizeObserver = new ResizeObserver(() => instance.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      clearTimeout(loadTimeout);
      resizeObserver.disconnect();
      instance.off("moveend", emitBounds);
      instance.remove();
      setMap(null);
      onMapReady?.(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webglSupported, retryKey]);

  // ── Tema: sigue el toggle explícito y la preferencia del sistema ──
  useEffect(() => {
    if (!map) return;

    const applyTheme = () => {
      const theme = getEffectiveTheme();
      map.setStyle(theme === "dark" ? DARK_STYLE_URL : LIGHT_STYLE_URL);
      map.once("style.load", () => {
        if (theme === "dark") applyDarkBrandTint(map);
        else applyLightBrandTint(map);
      });
    };

    const observer = new MutationObserver(applyTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    mql.addEventListener("change", applyTheme);

    return () => {
      observer.disconnect();
      mql.removeEventListener("change", applyTheme);
    };
  }, [map]);

  // ── Diff de markers en cada recomputo de clusters ──────────────
  useEffect(() => {
    if (!map) return;
    const current = markersRef.current;
    const seen = new Set<string>();

    for (const feature of rendered) {
      const [lng, lat] = feature.geometry.coordinates;

      if (isCluster(feature)) {
        const id = `cluster-${feature.properties.cluster_id}`;
        seen.add(id);
        let marker = current.get(id);
        const el = marker ? (marker.getElement() as HTMLDivElement) : createClusterElement(feature.properties.point_count);
        updateClusterElement(el, feature.properties.point_count);
        // Guardamos siempre el centro/cluster_id vigentes en dataset — si este
        // mismo id se reutiliza para un cluster distinto entre recomputes, el
        // handler de click (registrado una sola vez, abajo) los relee frescos
        // en vez de quedarse con los de la clausura original.
        setClusterTarget(el, feature.properties.cluster_id, lng, lat);
        if (!marker) {
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            const target = getClusterTarget(el);
            const zoom = getExpansionZoom(target.clusterId);
            map.flyTo({ center: [target.lng, target.lat], zoom, duration: 500 });
          });
          marker = new Marker({ element: el, anchor: "center" }).setLngLat([lng, lat]).addTo(map);
          current.set(id, marker);
        } else {
          marker.setLngLat([lng, lat]);
        }
      } else {
        const property = feature.properties;
        const id = `point-${property.id}`;
        seen.add(id);
        let marker = current.get(id);
        const el = marker ? (marker.getElement() as HTMLDivElement) : createPropertyPinElement(property);
        if (marker) updatePropertyPinElement(el, property);
        if (!marker) {
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            onSelectChange(property.id);
          });
          el.addEventListener("mouseenter", () => onHoverChange(property.id));
          el.addEventListener("mouseleave", () => onHoverChange(null));
          marker = new Marker({ element: el, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map);
          current.set(id, marker);
        } else {
          marker.setLngLat([lng, lat]);
        }
      }
    }

    for (const [id, marker] of current) {
      if (!seen.has(id)) {
        marker.remove();
        current.delete(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, rendered]);

  // ── Highlight de hover (sincronizado con el panel de resultados) ──
  useEffect(() => {
    for (const [id, marker] of markersRef.current) {
      const propertyId = id.startsWith("point-") ? id.slice("point-".length) : null;
      setPinHighlighted(marker.getElement(), propertyId !== null && propertyId === hoveredId);
    }
  }, [hoveredId, rendered]);

  // ── Popup de la propiedad seleccionada ──────────────────────────
  useEffect(() => {
    if (!map) return;

    if (popupRef.current) {
      popupRef.current.root.unmount();
      popupRef.current.popup.remove();
      popupRef.current = null;
    }

    if (!selectedId) return;

    const feature = features.find((f) => f.properties.id === selectedId);
    if (!feature) return;

    const container = document.createElement("div");
    const root = createRoot(container);
    root.render(
      <PropertyPopupCard property={feature.properties} onClose={() => onSelectChange(null)} />
    );

    const popup = new Popup({
      closeButton: false,
      closeOnClick: false,
      anchor: "bottom",
      offset: 26,
      maxWidth: "none",
      className: "umbral-popup",
    })
      .setLngLat(feature.geometry.coordinates as [number, number])
      .setDOMContent(container)
      .addTo(map);

    popupRef.current = { popup, root, container };

    return () => {
      root.unmount();
      popup.remove();
      popupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedId, features]);

  // ── Escape cierra la selección ──────────────────────────────────
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onSelectChange(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedId, onSelectChange]);

  return (
    <div className="absolute inset-0 bg-surface-2">
      {/*
        NUNCA `absolute` (ni ninguna otra clase que fije `position`) en el
        div que se pasa como `container` a `new MapLibreMap()`: MapLibre le
        agrega su propia clase `.maplibregl-map` (position:relative) al MISMO
        nodo, y con la misma especificidad CSS gana la que carga después en
        el documento — el CSS de maplibre-gl, importado por este componente
        dinámico, siempre llega después que el global. Esto pisaba nuestro
        `position:absolute` y colapsaba la altura del mapa a 0 (el "no se ve
        el mapa" original). `h-full w-full` no choca ninguna propiedad con
        `.maplibregl-map`, así que alcanza con que el padre (arriba) sea
        quien tenga `position:absolute` real.
      */}
      <div ref={containerRef} className="h-full w-full" />

      {!webglSupported && (
        <MapStatusMessage
          title="Tu navegador no soporta el mapa interactivo"
          description="Falta soporte de WebGL. Probá actualizar el navegador o activar la aceleración por hardware en su configuración."
        />
      )}

      {webglSupported && mapError && (
        <MapStatusMessage
          title="No pudimos cargar el mapa"
          description="Revisá tu conexión a internet e intentá de nuevo."
          action={
            <Button
              size="sm"
              onClick={() => {
                setMapError(false);
                setRetryKey((k) => k + 1);
              }}
            >
              Reintentar
            </Button>
          }
        />
      )}

      {webglSupported && !mapError && mapDegraded && (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center">
          <div className="rounded-pill bg-surface px-4 py-2 text-sm text-text-muted shadow-float">
            El mapa está tardando en cargar…
          </div>
        </div>
      )}
    </div>
  );
}

function MapStatusMessage({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
      <div className="flex max-w-xs flex-col items-center gap-3 rounded-card bg-surface p-6 text-center shadow-float">
        <p className="font-display text-base font-semibold text-text">{title}</p>
        <p className="text-sm text-text-muted">{description}</p>
        {action}
      </div>
    </div>
  );
}
