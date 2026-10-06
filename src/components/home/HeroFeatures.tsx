"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Compass, Users, Building2 } from "lucide-react";

/**
 * Fila de features en la parte inferior del hero, al estilo de la
 * referencia (Custom things | People's first choice | Different varieties).
 * Adaptado al contexto inmobiliario.
 */

const FEATURES = [
  { icon: Compass, label: "Recorridos", sublabel: "virtuales 3D" },
  { icon: Users, label: "Primera", sublabel: "opción del mercado" },
  { icon: Building2, label: "Diferentes", sublabel: "propiedades" },
] as const;

export function HeroFeatures() {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      if (reduceMotion || !scope.current) return;

      gsap.fromTo(
        scope.current.children,
        { opacity: 0, y: 24 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          ease: "expo.out",
          stagger: 0.1,
          delay: 2.2,
          clearProps: "transform,opacity",
        }
      );
    },
    { scope }
  );

  return (
    <div
      ref={scope}
      data-hero-features=""
      className="hero-features pointer-events-none"
    >
      {FEATURES.map((feat) => (
        <div key={feat.label} className="hero-feature-item">
          <div className="hero-feature-icon">
            <feat.icon className="h-5 w-5" aria-hidden />
          </div>
          <div className="hero-feature-text">
            <span className="hero-feature-label">{feat.label}</span>
            <span className="hero-feature-sublabel">{feat.sublabel}</span>
          </div>
        </div>
      ))}
    </div>
  );
}