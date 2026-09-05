"use client";

import { useState } from "react";
import type { MapLibreMap } from "maplibre-gl";
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
          <PlusIcon />
        </IconButton>
        <div className="h-px bg-border" />
        <IconButton
          variant="ghost"
          size={44}
          aria-label="Alejar"
          className="rounded-none"
          onClick={() => map?.zoomOut({ duration: 250 })}
        >
          <MinusIcon />
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
        <LocateIcon spinning={locating} />
      </IconButton>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function LocateIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={spinning ? "h-[18px] w-[18px] animate-spin" : "h-[18px] w-[18px]"}
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2v3M12 19v3M2 12h3M19 12h3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
