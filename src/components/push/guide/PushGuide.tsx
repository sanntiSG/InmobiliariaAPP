"use client";

import { useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { brand } from "@/config/brand";
import type { Device, PushStatus } from "@/lib/push/device";
import { guideFor } from "@/lib/push/guide";
import { cn } from "@/lib/utils/cn";
import { SceneArt } from "./scenes";

type Props = {
  kind: PushStatus["kind"];
  device: Device;
  /** Más chica, para ir dentro de una tarjeta. */
  compact?: boolean;
  className?: string;
};

/**
 * La guía paso a paso para activar los avisos, con una ilustración por paso que marca con un anillo lo que hay que tocar. Los pasos
 * dependen del dispositivo y del navegador (ver `guideFor`): iPhone y iPad (Safari → Compartir → Agregar a inicio), el cuadro de
 * permiso de cada plataforma y cómo desbloquear los avisos. Se avanza a mano (anterior / siguiente): nadie queda mirando una animación
 * que ya pasó. Con "reducir movimiento" las ilustraciones quedan quietas, con lo que hay que tocar resaltado.
 */
export function PushGuide({ kind, device, compact = false, className }: Props) {
  const steps = useMemo(() => guideFor(kind, device), [kind, device]);
  const [index, setIndex] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const current = steps[Math.min(index, steps.length - 1)];
  const scene = current?.scene;

  // Cada escena arranca su propia animación: el anillo late sobre lo que hay que tocar, lo resaltado respira y la hoja de Compartir sube.
  useGSAP(
    () => {
      const root = stage.current;
      if (!root) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const sheet = root.querySelector("[data-sheet]");
        const ring = root.querySelector(".guide-ring");
        const marks = root.querySelectorAll("[data-hl]");
        const wait = sheet ? 0.55 : 0.15;
        if (sheet) gsap.from(sheet, { y: 140, opacity: 0, duration: 0.55, ease: "power3.out" });
        if (ring) gsap.fromTo(ring, { scale: 0.45, opacity: 0.95 }, { scale: 1.5, opacity: 0, duration: 1.15, ease: "power2.out", repeat: -1, repeatDelay: 0.25, delay: wait });
        if (marks.length > 0) gsap.fromTo(marks, { opacity: 1 }, { opacity: 0.4, duration: 0.85, ease: "sine.inOut", yoyo: true, repeat: -1, delay: wait });
      });
      return () => mm.revert();
    },
    { scope: stage, dependencies: [scene] }
  );

  if (!current || !scene) return null;
  const wide = scene.startsWith("desktop");

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div ref={stage} className={cn("w-full", wide ? (compact ? "max-w-[300px]" : "max-w-[360px]") : compact ? "max-w-[170px]" : "max-w-[220px]")}>
        <SceneArt key={scene} scene={scene} appName={brand.name} className="h-auto w-full overflow-visible drop-shadow-[0_8px_18px_rgba(0,0,0,0.10)]" />
      </div>

      <div key={index} className="rise w-full max-w-sm text-center">
        {steps.length > 1 && <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Paso {index + 1} de {steps.length}</p>}
        <p aria-live="polite" className={cn("mt-1 font-medium text-text", compact ? "text-sm" : "text-base")}>
          {current.text}
        </p>
        {current.note && <p className="mt-2 rounded-media bg-warning-soft px-3 py-2 text-left text-sm text-text">{current.note}</p>}
      </div>

      {steps.length > 1 && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            aria-label="Paso anterior"
            className="grid size-11 place-items-center rounded-full bg-surface-2 text-text transition-[transform,opacity] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.94] disabled:opacity-35"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <ol className="flex items-center" aria-label="Pasos">
            {steps.map((s, i) => (
              <li key={s.text}>
                <button type="button" onClick={() => setIndex(i)} aria-label={`Ir al paso ${i + 1}`} aria-current={i === index ? "step" : undefined} className="grid size-6 place-items-center">
                  <span className={cn("block rounded-full transition-[width,background-color] duration-200 [transition-timing-function:var(--ease-out)]", i === index ? "h-2 w-5 bg-accent" : "size-2 bg-text-muted/40")} />
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))}
            disabled={index === steps.length - 1}
            aria-label="Paso siguiente"
            className="grid size-11 place-items-center rounded-full bg-accent text-accent-contrast transition-[transform,opacity] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.94] disabled:opacity-35"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
