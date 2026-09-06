"use client";

import { useMemo, useState } from "react";
import { Gallery } from "./Gallery";
import { ModelViewer } from "./ModelViewer";
import { normalizeTourUrl } from "@/lib/media/tour-embed";
import { cn } from "@/lib/utils/cn";
import type { PropertyDetail } from "./types";

type Tab = "fotos" | "tour3d";

/**
 * Combina fotos y recorrido 3D en tabs. Si la propiedad no tiene Digital
 * Twin, el tab de recorrido directamente no existe (nunca un tab roto).
 * El recorrido en sí puede ser un link hosteado (Matterport/Polycam/Kuula/
 * Sketchfab, `kind: "iframe"`) o la URL de un archivo 3D ya hosteado
 * (`kind: "mesh"`, glb/gltf/usdz) renderizado con <model-viewer>.
 */
export function PropertyMedia({ images, tour3d, title }: Pick<PropertyDetail, "images" | "tour3d" | "title">) {
  const [tab, setTab] = useState<Tab>(tour3d?.enabled ? "tour3d" : "fotos");

  // Re-normaliza el embedUrl al renderizar (no sólo al guardar), para que
  // una propiedad guardada antes de este arreglo (con el link de "share" de
  // Polycam en vez del de "/embed") se corrija sola, sin migrar la base.
  const embedUrl = useMemo(() => {
    if (tour3d?.kind !== "iframe" || !tour3d.embedUrl) return undefined;
    const detected = normalizeTourUrl(tour3d.embedUrl);
    return detected.kind === "iframe" ? detected.url : tour3d.embedUrl;
  }, [tour3d]);

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
            ) : embedUrl ? (
              <iframe
                src={embedUrl}
                title={`Recorrido 3D — ${title}`}
                className="h-full w-full"
                allow="xr-spatial-tracking; gyroscope; accelerometer; fullscreen; vr"
                allowFullScreen
                loading="lazy"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-text-muted">
                El recorrido 3D no está disponible.
              </div>
            )}
          </div>
          {embedUrl && (
            <div className="border-t border-border px-4 py-2.5 text-right">
              <a
                href={embedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-accent hover:underline"
              >
                Abrir en una pestaña nueva ↗
              </a>
            </div>
          )}
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
