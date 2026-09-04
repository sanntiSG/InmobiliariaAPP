"use client";

import { useState } from "react";
import { Gallery } from "./Gallery";
import { ModelViewer } from "./ModelViewer";
import { cn } from "@/lib/utils/cn";
import type { PropertyDetail } from "./types";

type Tab = "fotos" | "tour3d";

/**
 * Combina fotos y recorrido 3D en tabs. Si la propiedad no tiene Digital
 * Twin, el tab de recorrido directamente no existe (nunca un tab roto).
 * El recorrido en sí puede ser un link hosteado (Matterport/Polycam/Kuula,
 * `kind: "iframe"`) o un archivo 3D propio (`kind: "mesh"`, glb/gltf/usdz
 * — ej. exportado de Polycam) renderizado con <model-viewer>.
 */
export function PropertyMedia({ images, tour3d, title }: Pick<PropertyDetail, "images" | "tour3d" | "title">) {
  const [tab, setTab] = useState<Tab>(tour3d?.enabled ? "tour3d" : "fotos");

  if (!tour3d?.enabled) {
    return <Gallery images={images} title={title} />;
  }

  return (
    <div>
      <div className="mb-3 inline-flex rounded-pill bg-surface-2 p-1">
        <TabButton active={tab === "tour3d"} onClick={() => setTab("tour3d")}>
          <TourIcon /> Recorrido 3D
        </TabButton>
        <TabButton active={tab === "fotos"} onClick={() => setTab("fotos")}>
          Fotos {images.length > 0 && `(${images.length})`}
        </TabButton>
      </div>

      {tab === "tour3d" ? (
        <div className="overflow-hidden rounded-card bg-surface-2 shadow-card">
          <div className="aspect-[16/10] w-full">
            {tour3d.kind === "mesh" && tour3d.meshUrl ? (
              <ModelViewer src={tour3d.meshUrl} alt={`Recorrido 3D — ${title}`} poster={tour3d.thumbnail} />
            ) : tour3d.embedUrl ? (
              <iframe
                src={tour3d.embedUrl}
                title={`Recorrido 3D — ${title}`}
                className="h-full w-full"
                allow="xr-spatial-tracking; gyroscope; accelerometer"
                allowFullScreen
                loading="lazy"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-text-muted">
                El recorrido 3D no está disponible.
              </div>
            )}
          </div>
        </div>
      ) : (
        <Gallery images={images} title={title} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-sm font-medium",
        "transition-colors duration-150",
        active ? "bg-accent text-accent-contrast" : "text-text-muted hover:text-text"
      )}
    >
      {children}
    </button>
  );
}

function TourIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <ellipse cx="12" cy="12" rx="9" ry="4" stroke="currentColor" strokeWidth="1.6" />
      <ellipse cx="12" cy="12" rx="9" ry="4" stroke="currentColor" strokeWidth="1.6" transform="rotate(60 12 12)" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}
