"use client";

import { useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ArrowRight, Building2, Compass } from "lucide-react";

const OPTIONS = [
  {
    href: "/crear-cuenta?tipo=explorar",
    icon: Compass,
    title: "Explorar propiedades",
    description: "Guardá favoritos, dá me gusta, comentá y recibí recomendaciones hechas para vos.",
    cta: "Crear cuenta de explorador",
  },
  {
    href: "/crear-cuenta?tipo=gestionar",
    icon: Building2,
    title: "Gestionar una inmobiliaria",
    description: "Publicá propiedades con recorridos 360°, seguí tus estadísticas y atendé a tus interesados.",
    cta: "Solicitar acceso",
  },
] as const;

/**
 * Primer paso de /crear-cuenta: dos tarjetas grandes para elegir qué se quiere
 * hacer. Explorar sigue siendo opcional (sin cuenta se puede navegar todo el
 * sitio) — se aclara debajo.
 */
export function AccountTypeChooser() {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from("[data-account-card]", {
        opacity: 0,
        y: 14,
        duration: 0.5,
        ease: "expo.out",
        stagger: 0.08,
        clearProps: "transform,opacity",
      });
    },
    { scope }
  );

  return (
    <div ref={scope}>
      <div className="grid gap-4 sm:grid-cols-2">
        {OPTIONS.map(({ href, icon: Icon, title, description, cta }) => (
          <Link
            key={href}
            href={href}
            data-account-card=""
            className="group flex flex-col gap-3 rounded-card border border-border bg-surface p-5 transition-[transform,box-shadow,border-color] duration-200 [transition-timing-function:var(--ease-out)] hover:-translate-y-0.5 hover:border-accent hover:shadow-float focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 active:scale-[0.99]"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="font-display text-lg font-bold text-text">{title}</span>
            <span className="text-sm text-text-muted">{description}</span>
            <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-medium text-accent">
              {cta}
              <ArrowRight
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden
              />
            </span>
          </Link>
        ))}
      </div>
      <p className="mt-5 text-center text-sm text-text-muted">
        Para solo mirar propiedades no necesitás cuenta:{" "}
        <Link href="/mapa" className="font-medium text-accent hover:underline">
          explorar sin registrarme
        </Link>
      </p>
    </div>
  );
}
