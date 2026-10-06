"use client";

import { useRef, type ReactNode } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

/**
 * Entrada escalonada de las secciones del panel: un fundido corto con 8 px de
 * desplazamiento, una sola vez al abrir. Se anima sólo lo que tiene
 * `data-reveal` y respeta `prefers-reduced-motion`. Pensado para que el panel
 * se sienta ordenado al cargar, sin retrasar ninguna interacción.
 */
export function DashboardReveal({ children, className }: { children: ReactNode; className?: string }) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from("[data-reveal]", {
        opacity: 0,
        y: 8,
        duration: 0.32,
        ease: "power3.out",
        stagger: 0.045,
        clearProps: "transform,opacity",
      });
    },
    { scope }
  );

  return (
    <div ref={scope} className={className}>
      {children}
    </div>
  );
}
