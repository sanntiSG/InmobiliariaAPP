"use client";

import { useState } from "react";
import dynamicImport from "next/dynamic";
import { Orbit, Route, Sparkles } from "lucide-react";
import { Gallery } from "./Gallery";
import { AmbientCoverLazy } from "./AmbientCoverLazy";
import { cn } from "@/lib/utils/cn";
import { track } from "@/lib/tracking/client";
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

type Tab = "ambient" | "fotos" | "vista360" | "recorrido360";

const is360 = (tab: Tab) => tab === "vista360" || tab === "recorrido360";

/**
 * Combina portada viva, fotos y foto(s) 360° en tabs. Un tab que no tiene
 * contenido directamente no existe (nunca un tab roto).
 *
 * Si la propiedad tiene portada viva, arranca ahí: ES su portada. Si no,
 * arranca en las fotos — el recorrido 360° es una opción que el visitante
 * elige ver, no lo primero que se le muestra.
 *
 * Una propiedad puede tener varios recorridos (`tours`) — distintos
 * ambientes — en ese caso aparecen chips para elegir cuál ver; se muestra
 * el primero de la lista por defecto (el orden lo elige la inmobiliaria al
 * cargarlos).
 */
export function PropertyMedia({
  propertyId,
  trackingEnabled = true,
  images,
  tours,
  virtualTour,
  ambient,
  title,
}: Pick<PropertyDetail, "images" | "tours" | "virtualTour" | "ambient" | "title"> & {
  propertyId: string;
  /** false en vistas previas de borradores y del dueño: no cuentan como interés real. */
  trackingEnabled?: boolean;
}) {
  const hasTours = tours.length > 0;
  const [tab, setTabState] = useState<Tab>(ambient ? "ambient" : "fotos");
  const [selectedIndex, setSelectedIndexState] = useState(0);

  // `tour_open` = la persona eligió ver el 360° (no es la vista inicial).
  function setTab(next: Tab) {
    if (trackingEnabled && is360(next) && !is360(tab)) {
      track({ propertyId, event: "tour_open" });
      const first = next === "vista360" ? tours[selectedIndex] : tours.find((t) => t.id === virtualTour.startId) ?? tours[0];
      if (first?.id) track({ propertyId, event: "tour_scene", sceneId: first.id });
    }
    setTabState(next);
  }

  function setSelectedIndex(i: number) {
    if (trackingEnabled && tours[i]?.id) track({ propertyId, event: "tour_scene", sceneId: tours[i].id });
    setSelectedIndexState(i);
  }

  function onVirtualSceneChange(sceneId: string) {
    if (trackingEnabled) track({ propertyId, event: "tour_scene", sceneId });
  }

  const active = tours[selectedIndex];
  const hasVirtualTour = virtualTour.enabled && tours.length > 1 && tours.some((t) => t.links.length > 0);

  if (!ambient && (!hasTours || !active)) {
    return <Gallery images={images} title={title} />;
  }

  // Con portada viva, una pestaña "Fotos" vacía sobra; y con una sola pestaña no hace falta la barra.
  const showPhotosTab = !ambient || images.length > 0;
  const tabCount = [!!ambient, showPhotosTab, hasTours, hasVirtualTour].filter(Boolean).length;

  return (
    <div>
      <div className={cn("mb-3 flex-wrap items-center gap-2", tabCount > 1 ? "flex" : "hidden")}>
        <div className="inline-flex max-w-full overflow-x-auto rounded-pill bg-surface-2 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {ambient && (
            <TabButton active={tab === "ambient"} onClick={() => setTab("ambient")}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Portada viva
            </TabButton>
          )}
          {showPhotosTab && (
            <TabButton active={tab === "fotos"} onClick={() => setTab("fotos")}>
              Fotos {images.length > 0 && `(${images.length})`}
            </TabButton>
          )}
          {hasTours && (
            <TabButton active={tab === "vista360"} onClick={() => setTab("vista360")}>
              <Orbit className="h-3.5 w-3.5" aria-hidden /> Vista 360°
            </TabButton>
          )}
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

      {tab === "ambient" && ambient ? (
        <AmbientCoverLazy
          manifest={ambient.manifest}
          baseUrl={ambient.baseUrl}
          states={ambient.states}
          start={ambient.start}
          title={title}
        />
      ) : tab === "recorrido360" && hasVirtualTour ? (
        <div className="overflow-hidden rounded-card bg-surface-2 shadow-card">
          <div className="aspect-[16/10] w-full">
            <VirtualTourViewer scenes={tours} startId={virtualTour.startId} onSceneChange={onVirtualSceneChange} />
          </div>
        </div>
      ) : tab === "vista360" && active ? (
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
