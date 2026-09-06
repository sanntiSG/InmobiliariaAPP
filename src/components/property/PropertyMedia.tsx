"use client";

import { useMemo, useState } from "react";
import { Gallery } from "./Gallery";
import { ModelViewer } from "./ModelViewer";
import { normalizeTourUrl } from "@/lib/media/tour-embed";
import { cn } from "@/lib/utils/cn";
import type { PropertyDetail, Tour3DEntry } from "./types";

type Tab = "fotos" | "tour3d";

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
 * Nota sobre embeds de terceros (Polycam en particular): probamos en algún
 * momento pre-bloquear el iframe con un chequeo de `navigator.gpu` (Polycam
 * renderiza con WebGPU) para evitar que su error crudo en inglés apareciera
 * dentro de la tarjeta en navegadores sin soporte. Se sacó: un usuario
 * confirmó que, en Safari, un recorrido que ESE chequeo daba por no
 * soportado cargaba perfecto al abrirlo directo en una pestaña — o sea que
 * el chequeo daba falsos negativos (probablemente porque la restricción es
 * sobre acceder a la GPU embebido en un iframe de otro origen, no sobre el
 * navegador en sí, y una pestaña propia no tiene esa restricción). Bloquear
 * contenido que en la práctica anda es peor que dejarlo intentar — por eso
 * ahora SIEMPRE se intenta el iframe, y la salida a pantalla completa queda
 * siempre visible arriba (no escondida detrás de una detección) para
 * cualquier embed que falle por la razón que sea.
 */
export function PropertyMedia({ images, tours, title }: Pick<PropertyDetail, "images" | "tours" | "title">) {
  const hasTours = tours.length > 0;
  const [tab, setTab] = useState<Tab>(hasTours ? "tour3d" : "fotos");
  const [selectedIndex, setSelectedIndex] = useState(0);

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
          {embedUrl && (
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
              <p className="text-xs text-text-muted">¿No carga bien acá?</p>
              <a
                href={embedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-sm font-medium text-accent hover:underline"
              >
                Ver en pantalla completa ↗
              </a>
            </div>
          )}
          <div className="aspect-[16/10] w-full">
            {active.kind === "mesh" && active.meshUrl ? (
              <ModelViewer src={active.meshUrl} alt={`Recorrido 3D — ${title}`} poster={active.thumbnail} />
            ) : embedUrl ? (
              <iframe
                src={embedUrl}
                title={`Recorrido 3D — ${title}`}
                className="h-full w-full"
                allow="xr-spatial-tracking; gyroscope; accelerometer; fullscreen; vr; gpu"
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
