"use client";

import { useState } from "react";
import type { MapLibreMap } from "maplibre-gl";
import { IconButton } from "@/components/ui/IconButton";

export function MapControls({ map, className }: { map: MapLibreMap | null; className?: string }) {
  const [locating, setLocating] = useState(false);

  function locate() {
    if (!map || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 14, duration: 800 });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  return (
    <div className={className}>
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
