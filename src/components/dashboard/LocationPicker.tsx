"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { LIGHT_STYLE_URL, applyLightBrandTint } from "@/lib/map/style-light";
import { DARK_STYLE_URL, applyDarkBrandTint } from "@/lib/map/style-dark";
import { MAP_DEFAULTS, ARGENTINA_BOUNDS } from "@/config/site";
import { ensureMapLibreWorkerUrl } from "@/lib/map/worker-url";
import { AddressSearch, type GeocodeResult } from "@/components/ui/AddressSearch";
import { buttonClasses } from "@/components/ui/Button";

function getEffectiveTheme(): "light" | "dark" {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Mapa con un pin arrastrable — buscar una dirección, clickear o arrastrar fija lng/lat en el formulario. */
export function LocationPicker({
  lng,
  lat,
  onChange,
}: {
  lng: number;
  lat: number;
  onChange: (lng: number, lat: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  // Effect Event (React 19.2): siempre ve el último `onChange` sin que el
  // efecto de montaje dependa de él ni tenga que re-crear el mapa.
  const notifyChange = useEffectEvent((newLng: number, newLat: number) => {
    onChange(newLng, newLat);
  });

  useEffect(() => {
    if (!containerRef.current) return;
    ensureMapLibreWorkerUrl();

    const map = new MapLibreMap({
      container: containerRef.current,
      style: getEffectiveTheme() === "dark" ? DARK_STYLE_URL : LIGHT_STYLE_URL,
      center: [lng, lat],
      zoom: 14,
      // Limita el paneo a Argentina — evita fijar por error una ubicación
      // fuera del país donde todavía no operan inmobiliarias en la plataforma.
      maxBounds: [
        [ARGENTINA_BOUNDS.west, ARGENTINA_BOUNDS.south],
        [ARGENTINA_BOUNDS.east, ARGENTINA_BOUNDS.north],
      ],
      attributionControl: false,
    });
    mapRef.current = map;

    map.on("load", () => {
      if (getEffectiveTheme() === "dark") applyDarkBrandTint(map);
      else applyLightBrandTint(map);
    });

    const el = document.createElement("div");
    el.style.width = "30px";
    el.style.height = "38px";
    el.innerHTML = `
      <svg width="30" height="38" viewBox="0 0 30 38" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 0C6.7 0 0 6.6 0 14.7 0 24.7 15 38 15 38S30 24.7 30 14.7C30 6.6 23.3 0 15 0Z" style="fill: var(--accent)" />
        <circle cx="15" cy="15" r="6.5" fill="white" />
      </svg>
    `;

    const marker = new Marker({ element: el, anchor: "bottom", draggable: true }).setLngLat([lng, lat]).addTo(map);
    markerRef.current = marker;

    marker.on("dragend", () => {
      const { lng: newLng, lat: newLat } = marker.getLngLat();
      notifyChange(newLng, newLat);
    });

    map.on("click", (e) => {
      marker.setLngLat(e.lngLat);
      notifyChange(e.lngLat.lng, e.lngLat.lat);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    markerRef.current?.setLngLat([lng, lat]);
  }, [lng, lat]);

  function handleAddressSelect(result: GeocodeResult) {
    // Llamado desde un click normal (fuera del efecto de montaje), así que
    // acá se usa `onChange` directo — la clausura ya está fresca en cada
    // render, no necesita el Effect Event (ese es solo para listeners
    // nativos registrados una sola vez dentro del efecto de montaje).
    markerRef.current?.setLngLat([result.lng, result.lat]);
    mapRef.current?.flyTo({ center: [result.lng, result.lat], zoom: 16, duration: 800 });
    onChange(result.lng, result.lat);
  }

  function handleUseMyLocation() {
    if (!("geolocation" in navigator)) {
      setLocateError("Tu navegador no soporta geolocalización.");
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude, latitude } = pos.coords;
        markerRef.current?.setLngLat([longitude, latitude]);
        mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 16, duration: 800 });
        onChange(longitude, latitude);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setLocateError(
          err.code === err.PERMISSION_DENIED
            ? "No diste permiso de ubicación en el navegador."
            : "No se pudo obtener tu ubicación."
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-col gap-2 sm:flex-row">
        <AddressSearch
          onSelect={handleAddressSelect}
          className="flex-1"
          placeholder="Buscar dirección, barrio o ciudad en Argentina…"
        />
        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={locating}
          className={buttonClasses("secondary", "md", "shrink-0 inline-flex items-center gap-1.5")}
        >
          {locating ? (
            "Ubicando…"
          ) : (
            <>
              <MapPin className="h-4 w-4" aria-hidden /> Usar mi ubicación
            </>
          )}
        </button>
      </div>
      {locateError && <p className="mb-2 text-xs text-danger">{locateError}</p>}
      <div className="overflow-hidden rounded-card">
        <div ref={containerRef} className="h-64 w-full" />
        <p className="mt-1.5 text-xs text-text-muted">
          Buscá una dirección, usá tu ubicación actual, o hacé click en el mapa / arrastrá el pin
          para ajustar la ubicación exacta.
        </p>
      </div>
    </div>
  );
}

export const DEFAULT_PICKER_CENTER = MAP_DEFAULTS.center;
