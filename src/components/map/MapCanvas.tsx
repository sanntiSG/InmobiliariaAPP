"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { MapLibreMap, Marker, Popup, AttributionControl } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MAP_DEFAULTS, ARGENTINA_BOUNDS } from "@/config/site";
import { LIGHT_STYLE_URL, applyLightBrandTint } from "@/lib/map/style-light";
import { DARK_STYLE_URL, applyDarkBrandTint } from "@/lib/map/style-dark";
import type { BBox } from "@/lib/map/geo";
import {
  useClusteredMarkers,
  isCluster,
  type PropertyFeature,
} from "@/lib/map/useClusteredMarkers";
import { createClusterElement, createPropertyPinElement, setPinHighlighted } from "@/lib/map/markers";
import { PropertyPopupCard } from "./PropertyPopupCard";

type EffectiveTheme = "light" | "dark";

function getEffectiveTheme(): EffectiveTheme {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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
  const markersRef = useRef(new Map<string, Marker>());
  const popupRef = useRef<{ popup: Popup; root: Root; container: HTMLDivElement } | null>(null);

  const { rendered, getExpansionZoom } = useClusteredMarkers(map, features);

  // ── Creación del mapa ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const instance = new MapLibreMap({
      container: containerRef.current,
      style: getEffectiveTheme() === "dark" ? DARK_STYLE_URL : LIGHT_STYLE_URL,
      center: MAP_DEFAULTS.center,
      zoom: MAP_DEFAULTS.zoom,
      minZoom: MAP_DEFAULTS.minZoom,
      maxZoom: MAP_DEFAULTS.maxZoom,
      // Acota el paneo a Argentina — la plataforma solo opera acá por ahora.
      maxBounds: [
        [ARGENTINA_BOUNDS.west, ARGENTINA_BOUNDS.south],
        [ARGENTINA_BOUNDS.east, ARGENTINA_BOUNDS.north],
      ],
      attributionControl: false,
    });
    instance.addControl(new AttributionControl({ compact: true }), "bottom-right");

    instance.on("load", () => {
      if (getEffectiveTheme() === "light") applyLightBrandTint(instance);
      else applyDarkBrandTint(instance);
      const b = instance.getBounds();
      onBoundsChange(
        { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
        instance.getZoom()
      );
      setMap(instance);
      onMapReady?.(instance);
    });

    const emitBounds = () => {
      const b = instance.getBounds();
      onBoundsChange(
        { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
        instance.getZoom()
      );
    };
    instance.on("moveend", emitBounds);

    // Click en el mapa vacío deselecciona (los pins están en elementos DOM
    // aparte y nunca disparan este evento — ver comentario en markers.ts).
    instance.on("click", () => onSelectChange(null));

    return () => {
      instance.off("moveend", emitBounds);
      instance.remove();
      setMap(null);
      onMapReady?.(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        if (!marker) {
          const el = createClusterElement(feature.properties.point_count);
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            const zoom = getExpansionZoom(feature.properties.cluster_id);
            map.flyTo({ center: [lng, lat], zoom, duration: 500 });
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
        if (!marker) {
          const el = createPropertyPinElement(property);
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

  return <div ref={containerRef} className="absolute inset-0" />;
}
