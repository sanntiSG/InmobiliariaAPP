"use client";

import { useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

export type SecondaryCta = {
  label: string;
  href: string;
  external?: boolean;
};

/**
 * Los dos CTA principales de la landing. El primero ("Explorar") es fijo;
 * el segundo cambia según quién mira (visitante → WhatsApp al proveedor,
 * inmobiliaria habilitada → su panel/onboarding, admin → panel de admin —
 * ver src/app/page.tsx). La entrada anima con GSAP, respetando
 * prefers-reduced-motion (mismo patrón que ResultsPanel).
 *
 * El contenedor no captura toques (pointer-events-none) para no tapar el
 * header en mobile; solo los botones son interactivos.
 */
export function HeroCtas({ secondaryCta }: { secondaryCta: SecondaryCta }) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion || !scope.current) return;
      gsap.fromTo(
        scope.current.children,
        { opacity: 0, y: 16 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: "expo.out",
          stagger: 0.08,
          delay: 1.6,
          clearProps: "transform,opacity",
        }
      );
    },
    { scope }
  );

  return (
    <div
      ref={scope}
      className="hero-ctas-row pointer-events-none relative z-10 flex w-full flex-col gap-3 sm:w-auto sm:flex-row"
    >
      <Link
        href="/mapa"
        className={buttonClasses(
          "primary",
          "lg",
          "pointer-events-auto w-full sm:w-auto sm:min-w-[200px]"
        )}
      >
        Explorar
      </Link>
      {/* <a> en vez de <Link>: el href es dinámico (ruta interna o wa.me
          externo según el rol — ver src/app/page.tsx), no una ruta estática
          conocida en tiempo de build. */}
      <a
        href={secondaryCta.href}
        target={secondaryCta.external ? "_blank" : undefined}
        rel={secondaryCta.external ? "noopener noreferrer" : undefined}
        className={cn(
          buttonClasses(
            "secondary",
            "lg",
            "pointer-events-auto w-full sm:w-auto sm:min-w-[200px]"
          )
        )}
      >
        {secondaryCta.label}
      </a>
    </div>
  );
}