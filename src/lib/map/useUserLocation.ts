"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import { NEARBY_RADIUS_KM } from "@/config/site";

const STORAGE_KEY = "umbral-geolocation";
type StoredDecision = "granted" | "denied";

function readStoredDecision(): StoredDecision | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

function storeDecision(v: StoredDecision) {
  try {
    localStorage.setItem(STORAGE_KEY, v);
  } catch {
    // localStorage puede fallar (modo privado, cuota) — no es crítico, solo
    // significa que se puede volver a preguntar en la próxima visita.
  }
}

function createUserMarkerElement(): HTMLDivElement {
  const root = document.createElement("div");
  root.className = "relative flex h-[18px] w-[18px] items-center justify-center";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/40"></span>
    <span class="relative inline-flex h-3.5 w-3.5 rounded-full bg-accent ring-2 ring-surface"></span>
  `;
  return root;
}

export type NearestSuggestion = {
  city: string;
  neighborhood?: string;
  lng: number;
  lat: number;
  distanceKm: number;
  count: number;
};

export type LocateResult = { ok: true } | { ok: false; reason: "denied" | "unavailable" | "unsupported" };

/**
 * Geolocalización de /mapa: ubica al usuario (marker propio + flyTo) y, si
 * no hay propiedades cerca, ofrece la zona más cercana donde sí las hay (ver
 * /api/map/nearest). El primer intento es automático y silencioso — respeta
 * la decisión guardada en localStorage para no re-promptear a quien ya
 * rechazó el permiso; `locateNow()` es para una acción explícita del usuario
 * (botón "Mi ubicación"), que sí vuelve a intentar sin importar lo guardado.
 */
export function useUserLocation(map: MapLibreMap | null) {
  const [suggestion, setSuggestion] = useState<NearestSuggestion | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const autoTriedRef = useRef(false);

  const checkNearby = useCallback((lng: number, lat: number) => {
    fetch(`/api/map/nearest?lng=${lng}&lat=${lat}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.countWithin === 0 && data.nearest) setSuggestion(data.nearest);
        else setSuggestion(null);
      })
      .catch(() => {});
  }, []);

  const placeMarker = useCallback(
    (lng: number, lat: number) => {
      if (!map) return;
      markerRef.current?.remove();
      const el = createUserMarkerElement();
      markerRef.current = new Marker({ element: el, anchor: "center" }).setLngLat([lng, lat]).addTo(map);
    },
    [map]
  );

  const locateNow = useCallback(
    (opts?: { zoom?: number; enableHighAccuracy?: boolean; maximumAge?: number }): Promise<LocateResult> => {
      return new Promise((resolve) => {
        if (!map || !("geolocation" in navigator)) {
          resolve({ ok: false, reason: "unsupported" });
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            storeDecision("granted");
            const { longitude, latitude } = pos.coords;
            placeMarker(longitude, latitude);
            map.flyTo({ center: [longitude, latitude], zoom: opts?.zoom ?? 13, duration: 1000 });
            checkNearby(longitude, latitude);
            resolve({ ok: true });
          },
          (err) => {
            if (err.code === err.PERMISSION_DENIED) storeDecision("denied");
            resolve({ ok: false, reason: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable" });
          },
          {
            enableHighAccuracy: opts?.enableHighAccuracy ?? true,
            timeout: 8000,
            maximumAge: opts?.maximumAge ?? 0,
          }
        );
      });
    },
    [map, placeMarker, checkNearby]
  );

  // Primer intento automático y silencioso al montar el mapa — una sola vez,
  // y solo si el usuario no rechazó el permiso antes en este navegador.
  useEffect(() => {
    if (!map || autoTriedRef.current) return;
    autoTriedRef.current = true;
    if (readStoredDecision() === "denied") return;
    locateNow({ enableHighAccuracy: false, maximumAge: 5 * 60_000 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
    };
  }, []);

  const goToSuggestion = useCallback(() => {
    if (!map || !suggestion) return;
    map.flyTo({ center: [suggestion.lng, suggestion.lat], zoom: 12, duration: 1000 });
    setSuggestion(null);
  }, [map, suggestion]);

  const dismissSuggestion = useCallback(() => setSuggestion(null), []);

  return { suggestion, radiusKm: NEARBY_RADIUS_KM, goToSuggestion, dismissSuggestion, locateNow };
}
