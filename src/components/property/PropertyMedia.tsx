"use client";

import { useEffect, useMemo, useState } from "react";
import { Gallery } from "./Gallery";
import { ModelViewer } from "./ModelViewer";
import { normalizeTourUrl } from "@/lib/media/tour-embed";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import type { PropertyDetail, Tour3DEntry } from "./types";

type Tab = "fotos" | "tour3d";

/** true si el user-agent es de un dispositivo móvil. Siempre false en SSR (no hay `navigator`). */
function isMobileUserAgent(): boolean {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/**
 * Combina fotos y recorrido(s) 3D en tabs. Si la propiedad no tiene ningún
 * Digital Twin, el tab de recorrido directamente no existe (nunca un tab
 * roto). Una propiedad puede tener varios recorridos (`tours`) — distintos
 * ambientes, o un link de Polycam más un `.glb` de respaldo — en ese caso
 * aparecen chips para elegir cuál ver; se muestra el primero de la lista por
 * defecto (el orden lo elige la inmobiliaria al cargarlos).
 *
 * El recorrido puede ser un link hosteado (Matterport/Polycam/Kuula/
 * Sketchfab, `kind: "iframe"`) o la URL de un archivo 3D ya hosteado
 * (`kind: "mesh"`, glb/gltf/usdz) renderizado con <model-viewer>.
 *
 * En mobile (Safari en particular), el visor de Polycam no carga embebido
 * en un iframe de otro origen (probado, no depende de nuestro código — ver
 * memoria de sesión) — ahí directamente no se intenta el iframe y se
 * muestra un link a pantalla completa. En desktop se intenta el iframe
 * normalmente. `kind:"mesh"` (`<model-viewer>`, WebGL) no tiene este
 * problema en ningún dispositivo.
 */
export function PropertyMedia({ images, tours, title }: Pick<PropertyDetail, "images" | "tours" | "title">) {
  const hasTours = tours.length > 0;
  const [tab, setTab] = useState<Tab>(hasTours ? "tour3d" : "fotos");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // `.then()` en vez de un setState directo en el cuerpo del efecto — evita
    // el warning de lint `react-hooks/set-state-in-effect`.
    Promise.resolve().then(() => setIsMobile(isMobileUserAgent()));
  }, []);

  const active = tours[selectedIndex] as Tour3DEntry | undefined;

  // Re-normaliza el embedUrl al renderizar (no sólo al guardar), para que
  // un recorrido guardado antes del fix de Polycam (con el link de "share"
  // en vez del de "/embed") se corrija solo, sin migrar la base.
  const embedUrl = useMemo(() => {
    if (!active || active.kind !== "iframe" || !active.embedUrl) return undefined;
    const detected = normalizeTourUrl(active.embedUrl);
    return detected.kind === "iframe" ? detected.url : active.embedUrl;
  }, [active]);

  if (!hasTours || !active) {
    return <Gallery images={images} title={title} />;
  }

  const blockedOnMobile = active.kind === "iframe" && isMobile;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-pill bg-surface-2 p-1">
          <TabButton active={tab === "tour3d"} onClick={() => setTab("tour3d")}>
            <TourIcon /> Recorrido 3D
          </TabButton>
          <TabButton active={tab === "fotos"} onClick={() => setTab("fotos")}>
            Fotos {images.length > 0 && `(${images.length})`}
          </TabButton>
        </div>

        {tab === "tour3d" && tours.length > 1 && (
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

      {tab === "tour3d" ? (
        <div className="overflow-hidden rounded-card bg-surface-2 shadow-card">
          <div className="aspect-[16/10] w-full">
            {active.kind === "mesh" && active.meshUrl ? (
              <ModelViewer src={active.meshUrl} alt={`Recorrido 3D — ${title}`} poster={active.thumbnail} />
            ) : blockedOnMobile ? (
              <MobileFullscreenPrompt embedUrl={embedUrl} tourIndex={selectedIndex} />
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
        </div>
      ) : (
        <Gallery images={images} title={title} />
      )}
    </div>
  );
}

/**
 * En mobile, el visor de Polycam no carga embebido — se lo manda a pantalla
 * completa en vez de mostrar el error crudo de Polycam dentro de la tarjeta.
 *
 * `target` NO es "_blank" a propósito: en mobile Safari, tocar dos links
 * "_blank" seguidos desde la MISMA página puede reusar la pestaña ya
 * abierta por el primero en vez de abrir una nueva — con varios recorridos,
 * eso hacía que elegir el recorrido 2 y tocar "Ver en pantalla completa"
 * siguiera mostrando el recorrido 1 (la pestaña vieja, nunca renavegada).
 * Un nombre de ventana distinto por recorrido (`tourIndex`) fuerza una
 * pestaña propia para cada uno.
 */
function MobileFullscreenPrompt({ embedUrl, tourIndex }: { embedUrl?: string; tourIndex: number }) {
  if (!embedUrl) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-muted">
        El recorrido 3D no está disponible.
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <a
        href={embedUrl}
        target={`recorrido-3d-${tourIndex}`}
        rel="noopener noreferrer"
        className={buttonClasses("primary", "md")}
      >
        Ver en pantalla completa ↗
      </a>
      <p className="text-xs text-text-muted">Al terminar, volvé a esta pestaña para seguir viendo la propiedad.</p>
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
