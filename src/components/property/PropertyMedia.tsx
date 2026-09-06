"use client";

import { useEffect, useMemo, useState } from "react";
import { Gallery } from "./Gallery";
import { ModelViewer } from "./ModelViewer";
import { normalizeTourUrl, PROVIDER_REQUIRES_WEBGPU, supportsWebGPU } from "@/lib/media/tour-embed";
import { cn } from "@/lib/utils/cn";
import type { PropertyDetail, Tour3DEntry } from "./types";

type Tab = "fotos" | "tour3d";

function requiresWebGPU(entry: Tour3DEntry): boolean {
  return entry.kind === "iframe" && !!PROVIDER_REQUIRES_WEBGPU[(entry.provider as keyof typeof PROVIDER_REQUIRES_WEBGPU) ?? "custom"];
}

/**
 * Combina fotos y recorrido(s) 3D en tabs. Si la propiedad no tiene ningún
 * Digital Twin, el tab de recorrido directamente no existe (nunca un tab
 * roto). Una propiedad puede tener varios recorridos (`tours`) — distintos
 * ambientes, o un link de Polycam más un `.glb` de respaldo — en ese caso
 * aparecen chips para elegir cuál ver.
 *
 * El recorrido puede ser un link hosteado (Matterport/Polycam/Kuula/
 * Sketchfab, `kind: "iframe"`) o la URL de un archivo 3D ya hosteado
 * (`kind: "mesh"`, glb/gltf/usdz) renderizado con <model-viewer>.
 *
 * Caso especial: el visor propio de Polycam renderiza con WebGPU (ver
 * `PROVIDER_REQUIRES_WEBGPU` en `tour-embed.ts`), que muchos navegadores
 * (sobre todo Safari salvo su versión más reciente) todavía no soportan —
 * en vez de mostrar el error crudo de Polycam dentro del iframe, se detecta
 * y se muestra un aviso propio, seleccionando automáticamente otro
 * recorrido de la propiedad que sí se pueda ver, si hay uno.
 */
export function PropertyMedia({ images, tours, title }: Pick<PropertyDetail, "images" | "tours" | "title">) {
  const hasTours = tours.length > 0;
  const [tab, setTab] = useState<Tab>(hasTours ? "tour3d" : "fotos");
  /** `null` = todavía no lo eligió el usuario, se auto-selecciona (ver `autoIndex`). */
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  // Arranca en `false` (igual en server y en el primer render del cliente,
  // para no romper la hidratación) y se corrige apenas monta — `navigator`
  // no existe en SSR.
  const [gpuOk, setGpuOk] = useState(false);

  useEffect(() => {
    // `.then()` en vez de un setState directo en el cuerpo del efecto — evita
    // el warning de lint `react-hooks/set-state-in-effect` (mismo patrón que
    // la carga diferida de la librería en `ModelViewer.tsx`).
    Promise.resolve().then(() => setGpuOk(supportsWebGPU()));
  }, []);

  const autoIndex = useMemo(() => {
    const idx = tours.findIndex((t) => !requiresWebGPU(t) || gpuOk);
    return idx === -1 ? 0 : idx;
  }, [tours, gpuOk]);

  const activeIndex = selectedIndex ?? autoIndex;
  const active = tours[activeIndex] as Tour3DEntry | undefined;

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

  const blockedByWebGPU = requiresWebGPU(active) && !gpuOk;

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
                aria-pressed={i === activeIndex}
                className={cn(
                  "rounded-pill px-3 py-1 text-xs font-medium transition-colors duration-150",
                  i === activeIndex
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
            ) : blockedByWebGPU ? (
              <WebGPUFallback embedUrl={embedUrl} onViewPhotos={() => setTab("fotos")} />
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
          {embedUrl && !blockedByWebGPU && (
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

/**
 * Se muestra en vez del iframe de Polycam cuando el navegador no soporta
 * WebGPU — evita que el visitante vea el error crudo en inglés de Polycam
 * ("3D models can't load on this browser") suelto dentro de la tarjeta.
 */
function WebGPUFallback({ embedUrl, onViewPhotos }: { embedUrl?: string; onViewPhotos: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm text-text-muted">
        Este recorrido necesita un navegador más nuevo para verse (Safari lo soporta recién desde la versión 26).
      </p>
      <div className="flex flex-wrap items-center justify-center gap-4 text-sm font-medium">
        <button type="button" onClick={onViewPhotos} className="text-accent hover:underline">
          Ver fotos
        </button>
        {embedUrl && (
          <a href={embedUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            Abrir igual ↗
          </a>
        )}
      </div>
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
