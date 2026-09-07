"use client";

import { useState } from "react";
import type { MapLibreMap } from "maplibre-gl";
import { Plus, Minus, LocateFixed } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import type { LocateResult } from "@/lib/map/useUserLocation";

const ERROR_MESSAGES: Record<Exclude<LocateResult, { ok: true }>["reason"], string> = {
  denied: "Bloqueaste el permiso de ubicación — habilitalo desde el navegador para usar esto.",
  unavailable: "No pudimos obtener tu ubicación. Probá de nuevo.",
  unsupported: "Tu navegador no soporta geolocalización.",
};

export function MapControls({
  map,
  locateNow,
  className,
}: {
  map: MapLibreMap | null;
  /** Ver useUserLocation — comparte el mismo marker/estado que el intento automático al entrar al mapa. */
  locateNow: (opts?: { zoom?: number }) => Promise<LocateResult>;
  className?: string;
}) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function locate() {
    setLocating(true);
    setError(null);
    const result = await locateNow({ zoom: 14 });
    setLocating(false);
    if (!result.ok) {
      setError(ERROR_MESSAGES[result.reason]);
      setTimeout(() => setError(null), 5000);
    }
  }

  return (
    <div className={className}>
      {error && (
        <div className="mb-2.5 max-w-[220px] rounded-card bg-surface p-3 text-xs text-text-muted shadow-float">
          {error}
        </div>
      )}
      <div className="flex flex-col overflow-hidden rounded-pill bg-surface shadow-float">
        <IconButton
          variant="ghost"
          size={44}
          aria-label="Acercar"
          className="rounded-none"
          onClick={() => map?.zoomIn({ duration: 250 })}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </IconButton>
        <div className="h-px bg-border" />
        <IconButton
          variant="ghost"
          size={44}
          aria-label="Alejar"
          className="rounded-none"
          onClick={() => map?.zoomOut({ duration: 250 })}
        >
          <Minus className="h-4 w-4" aria-hidden />
        </IconButton>
      </div>
      <IconButton
        variant="solid"
        size={44}
        aria-label="Mi ubicación"
        className="mt-2.5 shadow-float"
        onClick={locate}
        disabled={locating}
      >
        <LocateFixed className={locating ? "h-[18px] w-[18px] animate-spin" : "h-[18px] w-[18px]"} aria-hidden />
      </IconButton>
    </div>
  );
}
