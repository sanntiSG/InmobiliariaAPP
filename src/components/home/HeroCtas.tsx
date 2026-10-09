"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ChevronDown, Map as MapIcon, Sparkles } from "lucide-react";
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
const EXPLORE_OPTIONS = [
  { href: "/mapa", label: "Mapa", hint: "Propiedades en el mapa", icon: MapIcon },
  { href: "/espacio", label: "Mi espacio", hint: "Tus guardados y recomendaciones", icon: Sparkles },
] as const;

/**
 * Explorar con dos caminos (Mapa / Mi espacio) — sólo para quien explora con
 * cuenta. Menú accesible: `aria-expanded`, Esc y clic afuera lo cierran, el
 * foco vuelve al botón. Entrada breve con GSAP desde el botón (origen arriba).
 */
function ExploreMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  useGSAP(
    () => {
      if (!open || !menu.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.fromTo(
        menu.current,
        { opacity: 0, y: -6, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 0.2, ease: "power3.out", clearProps: "transform,opacity" }
      );
    },
    { dependencies: [open], scope: root }
  );

  return (
    <div ref={root} className="pointer-events-auto relative w-full sm:w-auto">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={buttonClasses("primary", "lg", "w-full sm:w-auto sm:min-w-[200px]")}
      >
        Explorar
        <ChevronDown
          className={cn("h-4 w-4 transition-transform duration-200 [transition-timing-function:var(--ease-out)]", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <div
          ref={menu}
          role="menu"
          className="absolute left-0 top-full z-30 mt-2 flex w-full min-w-[260px] origin-top flex-col gap-1 rounded-card bg-surface p-1.5 shadow-float sm:w-72"
        >
          {EXPLORE_OPTIONS.map(({ href, label, hint, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              role="menuitem"
              className="flex items-center gap-3 rounded-media px-3 py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold text-text">{label}</span>
                <span className="text-xs text-text-muted">{hint}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function HeroCtas({ secondaryCta, exploreMenu = false }: { secondaryCta: SecondaryCta; exploreMenu?: boolean }) {
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
      {exploreMenu ? (
        <ExploreMenu />
      ) : (
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
      )}
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