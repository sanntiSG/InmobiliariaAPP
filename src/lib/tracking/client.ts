"use client";

import { useEffect } from "react";

export type TrackPayload = {
  propertyId: string;
  event: "view" | "dwell" | "share" | "contact" | "tour_open" | "tour_scene";
  value?: number;
  sceneId?: string;
  channel?: "whatsapp" | "phone" | "email";
  method?: "native" | "copy" | "whatsapp";
};

/** Envía un evento sin bloquear la navegación (sendBeacon, con fetch keepalive de respaldo). */
export function track(payload: TrackPayload): void {
  if (typeof window === "undefined") return;
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) return;
  } catch {
    // cae al fetch
  }
  fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

/** Menos que esto es un rebote, no una lectura — no se envía. */
const MIN_DWELL_MS = 3_000;

/**
 * Registra la vista de una ficha y su tiempo de permanencia (sólo mientras la
 * pestaña está visible). El servidor deduplica vistas repetidas en 30 min, así
 * que el doble montaje de StrictMode en desarrollo no infla nada.
 */
export function usePropertyTracking(propertyId: string, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    track({ propertyId, event: "view" });

    let visibleSince: number | null = document.visibilityState === "visible" ? Date.now() : null;
    let accumulated = 0;

    function flush() {
      if (visibleSince !== null) {
        accumulated += Date.now() - visibleSince;
        visibleSince = null;
      }
      if (accumulated >= MIN_DWELL_MS) track({ propertyId, event: "dwell", value: accumulated });
      accumulated = 0;
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") flush();
      else visibleSince = Date.now();
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [propertyId, enabled]);
}
