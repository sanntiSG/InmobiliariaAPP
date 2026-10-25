"use client";

import { useEffect, useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import { clip } from "@/lib/advisor/compose/format";
import { MascotFallback } from "./mascot/MascotFallback";
import { openAdvisor, setPageFocus } from "./store";

/**
 * "Preguntale al asesor" en la ficha de una propiedad. Al tocarlo abre el escenario del asesor (en modo explorador, aunque
 * quien mira gestione una inmobiliaria) con una consulta ya hecha: que cuente la propiedad y diga si la recomienda según las
 * preferencias de esa persona. El nombre, el póster y si el asesor está encendido llegan resueltos desde el servidor: así
 * el botón está desde el primer pintado y no "salta" cuando se hidrata la página.
 *
 * Mientras la ficha está abierta registra la propiedad como foco de la página: si la persona abre el asesor desde el
 * círculo flotante, también habla de esta propiedad.
 */
export function AskAboutProperty({
  propertyId,
  title,
  ctaTo,
  poster,
}: {
  propertyId: string;
  title: string;
  ctaTo: string;
  poster: string | null;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setPageFocus(propertyId);
    return () => setPageFocus(null);
  }, [propertyId]);

  return (
    <button
      ref={ref}
      type="button"
      // Se precarga el escenario (three.js + GSAP) apenas se acerca el puntero o el dedo: abre sin esperar.
      onPointerEnter={() => void import("./AdvisorStage")}
      onFocus={() => void import("./AdvisorStage")}
      onClick={() =>
        openAdvisor({
          mode: "explorer",
          focusPropertyId: propertyId,
          origin: ref.current?.getBoundingClientRect() ?? null,
          ask: {
            query: { intent: "explorer.about_property", slots: { propertyIds: [propertyId] } },
            label: `¿Me conviene «${clip(title, 40)}»?`,
          },
        })
      }
      className="group flex min-h-11 w-full items-center gap-3 rounded-pill border border-border-hi bg-accent-soft py-1.5 pl-1.5 pr-4 text-left text-sm font-semibold text-text shadow-[inset_0_1px_0_var(--highlight)] transition-[transform,background-color,border-color] duration-150 [transition-timing-function:var(--ease-out)] hover:border-border-act active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:w-fit"
    >
      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-surface">
        <MascotFallback poster={poster} calm />
      </span>
      <span className="min-w-0 flex-1 truncate sm:flex-none">Preguntale {ctaTo}</span>
      <ArrowUpRight
        className="h-4 w-4 shrink-0 text-accent transition-transform duration-150 [transition-timing-function:var(--ease-out)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        aria-hidden
      />
    </button>
  );
}
