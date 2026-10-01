"use client";

import { useState } from "react";
import dynamicImport from "next/dynamic";
import { Orbit, Route } from "lucide-react";
import { Gallery } from "./Gallery";
import { cn } from "@/lib/utils/cn";
import type { PropertyDetail } from "./types";

// Photo Sphere Viewer toca `document` al inicializar (WebGL/Three.js) —
// nunca puede correr en el servidor, igual que maplibre-gl en el mapa.
const Photo360Viewer = dynamicImport(() => import("./Photo360Viewer").then((m) => m.Photo360Viewer), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-surface-2 text-sm text-text-muted">
      Cargando foto 360°…
    </div>
  ),
});

const VirtualTourViewer = dynamicImport(() => import("./VirtualTourViewer").then((m) => m.VirtualTourViewer), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-surface-2 text-sm text-text-muted">
      Cargando recorrido 360°…
    </div>
  ),
});

type Tab = "fotos" | "vista360" | "recorrido360";

/**
 * Combina fotos y foto(s) 360° en tabs. Si la propiedad no tiene ningún
 * recorrido, el tab de 360° directamente no existe (nunca un tab roto).
 * Arranca siempre en el tab de fotos — el recorrido 360° es una opción que
 * el visitante elige ver, no lo primero que se le muestra.
 *
 * Una propiedad puede tener varios recorridos (`tours`) — distintos
 * ambientes — en ese caso aparecen chips para elegir cuál ver; se muestra
 * el primero de la lista por defecto (el orden lo elige la inmobiliaria al
 * cargarlos).
 */
export function PropertyMedia({
  images,
  tours,
  virtualTour,
  title,
}: Pick<PropertyDetail, "images" | "tours" | "virtualTour" | "title">) {
  const hasTours = tours.length > 0;
  const [tab, setTab] = useState<Tab>("fotos");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const active = tours[selectedIndex];
  const hasVirtualTour = virtualTour.enabled && tours.length > 1 && tours.some((t) => t.links.length > 0);

  if (!hasTours || !active) {
    return <Gallery images={images} title={title} />;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-pill bg-surface-2 p-1">
          <TabButton active={tab === "fotos"} onClick={() => setTab("fotos")}>
            Fotos {images.length > 0 && `(${images.length})`}
          </TabButton>
          <TabButton active={tab === "vista360"} onClick={() => setTab("vista360")}>
            <Orbit className="h-3.5 w-3.5" aria-hidden /> Vista 360°
          </TabButton>
          {hasVirtualTour && (
            <TabButton active={tab === "recorrido360"} onClick={() => setTab("recorrido360")}>
              <Route className="h-3.5 w-3.5" aria-hidden /> Recorrido 360°
            </TabButton>
          )}
        </div>

        {tab === "vista360" && tours.length > 1 && (
          <div className="inline-flex flex-wrap gap-1.5">
            {tours.map((t, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedIndex(i)}
                aria-pressed={i === selectedIndex}
                className={cn(
                  "rounded-pill px-3 py-1 text-xs font-medium transition-colors duration-150",
                  i === selectedIndex
                    ? "bg-accent text-accent-contrast"
                    : "bg-surface-2 text-text-muted hover:text-text"
                )}
              >
                {t.label || `Recorrido ${i + 1}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "recorrido360" && hasVirtualTour ? (
        <div className="overflow-hidden rounded-card bg-surface-2 shadow-card">
          <div className="aspect-[16/10] w-full">
            <VirtualTourViewer scenes={tours} startId={virtualTour.startId} />
          </div>
        </div>
      ) : tab === "vista360" ? (
        <div className="overflow-hidden rounded-card bg-surface-2 shadow-card">
          <div className="aspect-[16/10] w-full">
            <Photo360Viewer src={active.photo360Url} />
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
