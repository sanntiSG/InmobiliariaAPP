"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

/**
 * Texto del hero animado con efecto de escritura carácter-por-carácter,
 * al estilo de la referencia (HeroSecuence). El texto grande aparece
 * progresivamente como si se tipeara. Respeta prefers-reduced-motion.
 */
export function HeroTypingText({
  line1,
  line2Prefix,
  line2Bold,
  line2Suffix,
  subtitle,
}: {
  line1: string;
  line2Prefix?: string;
  line2Bold: string;
  line2Suffix?: string;
  subtitle: string;
}) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!scope.current) return;

      // Los textos arrancan ocultos (opacity: 0 en el JSX); con movimiento
      // reducido se muestran de una, sin animar.
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set("[data-hero-subtitle], [data-hero-line1], [data-hero-line2]", {
          opacity: 1,
        });
        return;
      }

      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });

      // Subtitle (pequeño texto superior)
      tl.fromTo(
        "[data-hero-subtitle]",
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.6 },
        0.3
      );

      // Línea 1 — typing effect (reveal with clip-path)
      tl.fromTo(
        "[data-hero-line1]",
        { opacity: 0, clipPath: "inset(0 100% 0 0)" },
        {
          opacity: 1,
          clipPath: "inset(0 0% 0 0)",
          duration: 1.2,
          ease: "power3.inOut",
          clearProps: "clipPath",
        },
        0.5
      );

      // Línea 2 — reveal
      tl.fromTo(
        "[data-hero-line2]",
        { opacity: 0, clipPath: "inset(0 100% 0 0)" },
        {
          opacity: 1,
          clipPath: "inset(0 0% 0 0)",
          duration: 1.4,
          ease: "power3.inOut",
          clearProps: "clipPath",
        },
        0.9
      );


    },
    { scope }
  );

  return (
    <div ref={scope} className="hero-typing-container pointer-events-none">
      {/* Subtítulo superior */}
      <div
        data-hero-subtitle=""
        className="hero-typing-subtitle"
        style={{ opacity: 0 }}
      >
        <span className="hero-typing-subtitle-icon"></span>
        <span>{subtitle}</span>
      </div>

      {/* Headline */}
      <h1 className="hero-typing-headline">
        <span
          data-hero-line1=""
          className="hero-typing-line1"
          style={{ opacity: 0 }}
        >

        </span>
        <span
          data-hero-line2=""
          className="hero-typing-line2"
          style={{ opacity: 0 }}
        >
          {line2Prefix && <span>{line2Prefix}</span>}
          <strong className="hero-typing-bold">{line2Bold}</strong>
          {line2Suffix && <span>{line2Suffix}</span>}
        </span>
      </h1>
    </div>
  );
}