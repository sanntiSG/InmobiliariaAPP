"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

/**
 * Titular del hero. Cada línea sube desde una máscara (overflow hidden) con
 * un stagger corto, y el eyebrow aparece justo antes. Sin destellos ni efecto
 * de "tipeo": la entrada es una sola acción legible. Respeta
 * prefers-reduced-motion (se muestra directo, sin animar).
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
        gsap.set("[data-hero-subtitle], [data-hero-line]", { opacity: 1 });
        return;
      }

      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });

      tl.fromTo(
        "[data-hero-subtitle]",
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.7, clearProps: "transform" },
        0.2
      );

      tl.fromTo(
        "[data-hero-line]",
        { opacity: 1, yPercent: 110 },
        { yPercent: 0, duration: 1.1, stagger: 0.12, clearProps: "transform" },
        0.3
      );
    },
    { scope }
  );

  return (
    <div
      ref={scope}
      data-hero-avoid="text"
      className="hero-typing-container pointer-events-none"
    >
      <p
        data-hero-subtitle=""
        className="hero-typing-subtitle"
        style={{ opacity: 0 }}
      >
        <span className="hero-typing-rule" aria-hidden />
        <span>{subtitle}</span>
      </p>

      <h1 className="hero-typing-headline">
        <span className="hero-line">
          <span
            data-hero-line=""
            className="hero-typing-line1"
            style={{ opacity: 0 }}
          >
            {line1}
          </span>
        </span>
        <span className="hero-line">
          <span
            data-hero-line=""
            className="hero-typing-line2"
            style={{ opacity: 0 }}
          >
            {line2Prefix && <span>{line2Prefix}</span>}
            <strong className="hero-typing-bold">{line2Bold}</strong>
            {line2Suffix && <span>{line2Suffix}</span>}
          </span>
        </span>
      </h1>
    </div>
  );
}
