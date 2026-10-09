"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Compass, Users, Building2 } from "lucide-react";

/**
 * Tres datos de la propuesta al pie del hero, como una sola línea de texto
 * separada por filetes (sin chips ni mayúsculas). En pantallas angostas pasa
 * a dos líneas, nunca con letra diminuta.
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
        { opacity: 0, y: 12 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          ease: "expo.out",
          stagger: 0.08,
          delay: 1.5,
          clearProps: "transform,opacity",
        }
      );
    },
    { scope }
  );

  return (
    <div
      ref={scope}
      data-hero-avoid="features"
      className="hero-features pointer-events-none"
    >
      {FEATURES.map((feat) => (
        <div key={feat.label} className="hero-feature-item">
          <feat.icon className="hero-feature-icon" aria-hidden />
          <span className="hero-feature-text">
            <span className="hero-feature-label">{feat.label}</span>{" "}
            <span className="hero-feature-sublabel">{feat.sublabel}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
