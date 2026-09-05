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
 */
export function HeroCtas({ secondaryCta }: { secondaryCta: SecondaryCta }) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion || !scope.current) return;
      gsap.fromTo(
        scope.current.children,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.4, ease: "expo.out", stagger: 0.06, delay: 0.1 }
      );
    },
    { scope }
  );

  return (
    <div ref={scope} className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
      <Link href="/mapa" className={buttonClasses("primary", "lg", "sm:min-w-[200px]")}>
        Explorar propiedades
      </Link>
      {/* <a> en vez de <Link>: el href es dinámico (ruta interna o wa.me
          externo según el rol — ver src/app/page.tsx), no una ruta estática
          conocida en tiempo de build. */}
      <a
        href={secondaryCta.href}
        target={secondaryCta.external ? "_blank" : undefined}
        rel={secondaryCta.external ? "noopener noreferrer" : undefined}
        className={cn(buttonClasses("secondary", "lg", "sm:min-w-[200px]"))}
      >
        {secondaryCta.label}
      </a>
    </div>
  );
}
