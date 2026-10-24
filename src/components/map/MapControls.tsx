"use client";

import { useState } from "react";
import { LocateFixed } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import type { LocateResult } from "@/lib/map/useUserLocation";

const ERROR_MESSAGES: Record<Exclude<LocateResult, { ok: true }>["reason"], string> = {
  denied: "Bloqueaste el permiso de ubicación — habilitalo desde el navegador para usar esto.",
  unavailable: "No pudimos obtener tu ubicación. Probá de nuevo.",
  unsupported: "Tu navegador no soporta geolocalización.",
};

/**
 * Sólo "Mi ubicación". El zoom con botones + y − se quitó: el lanzador del asesor ocupa esa esquina y el zoom ya se
 * hace con pellizco, doble toque, rueda y teclado.
 */
export function MapControls({
  locateNow,
  className,
}: {
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
      <IconButton
        variant="solid"
        size={44}
        aria-label="Mi ubicación"
        className="shadow-float"
        onClick={locate}
        disabled={locating}
      >
        <LocateFixed className={locating ? "h-[18px] w-[18px] animate-spin" : "h-[18px] w-[18px]"} aria-hidden />
      </IconButton>
    </div>
  );
}
