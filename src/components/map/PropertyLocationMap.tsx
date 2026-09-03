"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { MapLibreMap, Marker, AttributionControl } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { LIGHT_STYLE_URL, applyLightBrandTint } from "@/lib/map/style-light";
import { DARK_STYLE_URL, applyDarkBrandTint } from "@/lib/map/style-dark";
import { createPropertyPinElement } from "@/lib/map/markers";
import type { PropertyCardData } from "@/components/property/types";

function getEffectiveTheme(): "light" | "dark" {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Mapa simple de una sola propiedad — sin clustering ni filtros, solo ubicación. */
export function PropertyLocationMap({
  lng,
  lat,
  property,
}: {
  lng: number;
  lat: number;
  property: Pick<PropertyCardData, "id" | "title" | "price" | "currency" | "tour3d">;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: getEffectiveTheme() === "dark" ? DARK_STYLE_URL : LIGHT_STYLE_URL,
      center: [lng, lat],
      zoom: 15,
      attributionControl: false,
    });
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");
    map.scrollZoom.disable();

    map.on("load", () => {
      if (getEffectiveTheme() === "dark") applyDarkBrandTint(map);
      else applyLightBrandTint(map);
    });

    const el = createPropertyPinElement(property as PropertyCardData);
    new Marker({ element: el, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map);

    const observer = new MutationObserver(() => {
      const theme = getEffectiveTheme();
      map.setStyle(theme === "dark" ? DARK_STYLE_URL : LIGHT_STYLE_URL);
      map.once("style.load", () => (theme === "dark" ? applyDarkBrandTint(map) : applyLightBrandTint(map)));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      observer.disconnect();
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lng, lat]);

  return <div ref={containerRef} className="h-full w-full rounded-card" />;
}
