"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { useScrollEdges } from "./useScrollEdges";

export type SegmentedItem<T extends string> = {
  id: T;
  /** Lo que se ve dentro del botón (texto, ícono, conteo...). */
  content: ReactNode;
  /** Nombre completo para lectores de pantalla cuando el texto visible se acorta en pantallas chicas. */
  label?: string;
};

/**
 * Control segmentado: una fila de opciones con UN solo indicador que se desliza hasta la elegida. El indicador es
 * una capa de acento del tamaño de toda la fila recortada con `clip-path` (la ventana se mueve; no se anima ni el
 * ancho ni la posición de ningún elemento). Si las opciones no entran, la fila se desliza con degradé en el borde y
 * la elegida se acerca sola a la vista. Las medidas se escriben directo en el DOM (variables CSS), sin pasar por
 * el estado de React.
 */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  const [scrollRef, edges] = useScrollEdges<HTMLDivElement>();
  const trackRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());

  const measure = useCallback(() => {
    const track = trackRef.current;
    const el = itemRefs.current.get(value);
    if (!track || !el) return;
    track.style.setProperty("--seg-l", `${el.offsetLeft}px`);
    track.style.setProperty("--seg-r", `${track.offsetWidth - el.offsetLeft - el.offsetWidth}px`);
    track.dataset.ready = "true";
  }, [value]);

  // Antes de pintar: el indicador nace ya en su lugar (sin deslizarse desde cero al montar).
  useLayoutEffect(() => {
    measure();
  }, [measure, items.length]);

  // Los anchos cambian con el tamaño de la pantalla y cuando termina de bajar la tipografía.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [measure]);

  // La opción elegida siempre queda a la vista dentro de la fila que se desliza.
  useEffect(() => {
    itemRefs.current.get(value)?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [value]);

  return (
    <div
      ref={scrollRef}
      data-edge-start={edges.start || undefined}
      data-edge-end={edges.end || undefined}
      className={cn(
        "scroll-fade-x min-w-0 max-w-full overflow-x-auto rounded-pill bg-surface-2 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "inline-flex",
        className
      )}
    >
      <div ref={trackRef} className="seg-track relative inline-flex">
        <span className="seg-indicator" aria-hidden />
        {items.map((item) => {
          const active = item.id === value;
          return (
            <button
              key={item.id}
              ref={(el) => {
                if (el) itemRefs.current.set(item.id, el);
                else itemRefs.current.delete(item.id);
              }}
              type="button"
              onClick={() => onChange(item.id)}
              aria-pressed={active}
              aria-label={item.label}
              className={cn(
                // Nunca se parte en dos líneas ni se encoge: si no entran todas, la fila se desliza.
                "relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill px-3 py-2 text-sm font-medium sm:px-4",
                "transition-colors duration-200 [transition-timing-function:var(--ease-out)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                active ? "text-accent-contrast" : "text-text-muted hover:text-text"
              )}
            >
              {item.content}
            </button>
          );
        })}
      </div>
    </div>
  );
}
