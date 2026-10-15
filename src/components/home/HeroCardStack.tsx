"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Compass, Heart, MapPin, Star, TrendingUp } from "lucide-react";

/**
 * Abanico de tarjetas ilustrativas del hero (los diferenciales de la
 * plataforma). Todo es DOM + SVG inline: cero imágenes y cero WebGL.
 *
 * Cada tarjeta tiene dos capas: la exterior (`.hero-card-pos`) fija posición y
 * rotación de reposo por CSS y es la que anima GSAP al entrar (desde una
 * posición dispersa que se asienta); la interior (`.hero-card`) hace la
 * flotación y el hover por CSS, sin pelearse con GSAP. El tamaño sale de
 * `cqw/cqh` del contenedor, así el abanico escala solo en cualquier pantalla.
 */

// Desvíos de entrada por tarjeta (fijos: sin Math.random, el SSR y el cliente coinciden).
const DRIFT = [
  { x: -18, y: 26, r: -9 },
  { x: 22, y: 20, r: 8 },
  { x: -24, y: 34, r: -7 },
  { x: 20, y: 38, r: 10 },
];

export function HeroCardStack() {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = scope.current;
      if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const small = window.matchMedia("(max-width: 639px)").matches;
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const cards = gsap.utils.toArray<HTMLElement>(".hero-card-pos", root);

      cards.forEach((card, i) => {
        const d = DRIFT[i] ?? DRIFT[0];
        gsap.fromTo(
          card,
          {
            opacity: 0,
            xPercent: small ? 0 : d.x,
            yPercent: d.y,
            rotation: small ? 0 : d.r,
            scale: 0.94,
            filter: coarse ? "blur(0px)" : "blur(8px)",
          },
          {
            opacity: 1,
            xPercent: 0,
            yPercent: 0,
            rotation: 0,
            scale: 1,
            filter: "blur(0px)",
            duration: 1,
            delay: 0.35 + i * 0.12,
            ease: "power3.out",
            clearProps: "transform,filter",
          }
        );
      });
    },
    { scope }
  );

  return (
    <div ref={scope} className="hero-stack" aria-hidden="true">
      <div className="hero-card-pos" data-card="tour">
        <div className="hero-card">
          <div className="hero-card-row">
            <span className="hero-chip">
              <Compass aria-hidden /> 360°
            </span>
            <span className="hero-card-meta">Recorrido</span>
          </div>
          <svg viewBox="0 0 200 84" className="hero-card-art" fill="none">
            <ellipse cx="100" cy="46" rx="86" ry="30" stroke="currentColor" strokeOpacity=".35" />
            <ellipse cx="100" cy="46" rx="44" ry="30" stroke="currentColor" strokeOpacity=".35" />
            <path d="M14 46h172M100 16v60" stroke="currentColor" strokeOpacity=".35" />
            <circle cx="132" cy="38" r="5" fill="var(--accent)" />
            <circle cx="132" cy="38" r="10" stroke="var(--accent)" strokeOpacity=".4" />
          </svg>
          <p className="hero-card-title">Entrá antes de entrar</p>
        </div>
      </div>

      <div className="hero-card-pos" data-card="map">
        <div className="hero-card">
          <svg viewBox="0 0 200 110" className="hero-card-art hero-card-map" fill="none">
            <path
              d="M0 30h200M0 70h200M40 0v110M110 0v110M165 0v110M0 100 200 20"
              stroke="currentColor"
              strokeOpacity=".22"
            />
            <circle cx="62" cy="52" r="12" fill="var(--accent)" />
            <text x="62" y="56.5" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--accent-contrast)">
              4
            </text>
            <circle cx="140" cy="38" r="5" fill="var(--accent)" />
            <circle cx="150" cy="82" r="5" fill="var(--accent)" />
          </svg>
          <div className="hero-card-row">
            <p className="hero-card-title">
              <MapPin aria-hidden /> Mapa de AMBA
            </p>
          </div>
        </div>
      </div>

      <div className="hero-card-pos" data-card="social">
        <div className="hero-card">
          <div className="hero-card-row hero-card-stats">
            <span>
              <Heart aria-hidden /> 1,2k
            </span>
            <span>
              <Star aria-hidden /> 4,8
            </span>
          </div>
          <p className="hero-card-quote">“Ideal, y el recorrido me ahorró dos visitas.”</p>
        </div>
      </div>

      <div className="hero-card-pos" data-card="panel">
        <div className="hero-card">
          <div className="hero-card-row">
            <span className="hero-card-meta">Tu panel</span>
            <span className="hero-chip hero-chip-up">
              <TrendingUp aria-hidden /> +12%
            </span>
          </div>
          <svg viewBox="0 0 200 50" className="hero-card-art" fill="none" preserveAspectRatio="none">
            <path
              d="M0 40 22 34 44 38 66 26 88 30 110 18 132 22 154 10 176 14 200 4"
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="hero-card-title">Visitas esta semana</p>
        </div>
      </div>
    </div>
  );
}
