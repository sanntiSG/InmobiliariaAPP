"use client";

import { useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Compass, MapPin, Heart, Lightbulb, TrendingUp } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { AGENCIES, CLOSING, SHOWCASE } from "@/config/home-sections";
import type { HomeAgentCard } from "@/lib/agents/home";
import { HomeAgents } from "./HomeAgents";
import type { SecondaryCta } from "./HeroCtas";

gsap.registerPlugin(ScrollTrigger);

/**
 * Secciones de la landing debajo del hero: cómo funciona, para inmobiliarias y
 * cierre. Efectos de scroll tomados de index2.html (título que se revela con el
 * scroll, marco que se abre con clip-path, tarjetas que se asientan, contadores,
 * líneas topográficas que se dibujan) con ScrollTrigger y sin scroll suave por JS.
 * Sólo transform/opacity; el blur y el `scrub` se omiten en pantallas táctiles.
 * El estado oculto inicial vive en CSS (`.js` y sin reduced-motion).
 */

function Chars({ text }: { text: string }) {
  const words = text.split(" ");
  return words.map((word, i) => (
    <span key={i}>
      <span className="hero-word" aria-hidden="true">
        {[...word].map((ch, j) => (
          <span key={j} className="hero-char" data-scrub-char="">
            {ch}
          </span>
        ))}
      </span>
      {i < words.length - 1 ? " " : null}
    </span>
  ));
}

const DRIFT = [
  { x: -14, r: -6 },
  { x: 16, r: 5 },
  { x: -10, r: -4 },
];

const nf = new Intl.NumberFormat("es-AR");

function CardArt({ kind }: { kind: (typeof AGENCIES.cards)[number]["kind"] }) {
  if (kind === "trend") {
    return (
      <div className="home-art">
        <span className="hero-chip hero-chip-up">
          <TrendingUp aria-hidden /> +10% visitas
        </span>
        <svg viewBox="0 0 200 56" fill="none" preserveAspectRatio="none" aria-hidden="true">
          <path
            d="M0 46 24 40 48 44 72 30 96 34 120 20 144 24 168 10 200 4"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }
  if (kind === "tips") {
    return (
      <ul className="home-art home-art-list" aria-hidden="true">
        <li>
          <Lightbulb /> Subí un recorrido 360°
        </li>
        <li>
          <Lightbulb /> Sumá fotos nuevas
        </li>
      </ul>
    );
  }
  return (
    <div className="home-art home-art-stages" aria-hidden="true">
      {["Nuevo", "Contactado", "Visita"].map((s, i) => (
        <span key={s} className={i === 0 ? "hero-chip" : "hero-chip home-chip-quiet"}>
          {s}
        </span>
      ))}
    </div>
  );
}

export function HomeSections({ secondaryCta, agents = [] }: { secondaryCta: SecondaryCta; /** Agentes que se muestran en su sección (ver `lib/agents/home.ts`); vacío = la sección no aparece. */ agents?: HomeAgentCard[] }) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return;
      const mm = gsap.matchMedia();

      mm.add(
        {
          motion: "(prefers-reduced-motion: no-preference)",
          coarse: "(pointer: coarse)",
          small: "(max-width: 639px)",
        },
        (ctx) => {
          const { motion, coarse, small } = ctx.conditions as Record<string, boolean>;
          if (!motion) return;

          const q = gsap.utils.selector(root);
          const blur = (px: number) => (coarse ? "blur(0px)" : `blur(${px}px)`);
          const clear = coarse ? "transform" : "transform,filter";

          // Títulos: letras que suben con el scroll (táctil: una sola vez).
          q("[data-scrub-title]").forEach((title) => {
            const chars = title.querySelectorAll("[data-scrub-char]");
            gsap.fromTo(
              chars,
              { y: "0.55em", opacity: 0, filter: blur(10) },
              {
                y: "0em",
                opacity: 1,
                filter: "blur(0px)",
                ease: "sine.out",
                stagger: coarse ? 0.014 : 0.03,
                duration: coarse ? 0.6 : undefined,
                clearProps: clear,
                scrollTrigger: coarse
                  ? { trigger: title, start: "top 90%", once: true }
                  : { trigger: title, start: "top 92%", end: "clamp(top 45%)", scrub: 1.1 },
              }
            );
          });

          // Eyebrows y textos sueltos.
          q("[data-reveal]").forEach((el) => {
            gsap.fromTo(
              el,
              { y: 24, opacity: 0, filter: blur(8) },
              {
                y: 0,
                opacity: 1,
                filter: "blur(0px)",
                duration: 0.8,
                ease: "power3.out",
                clearProps: clear,
                scrollTrigger: { trigger: el, start: "top 88%", once: true },
              }
            );
          });

          // Marco 360°: se abre con clip-path (efecto .tv-screen de index2).
          const frame = q("[data-frame]")[0];
          if (frame) {
            const from = { clipPath: "inset(12% 14% 12% 14% round 28px)", opacity: 0.35 };
            const to = {
              clipPath: "inset(0% 0% 0% 0% round 28px)",
              opacity: 1,
              ease: "none",
              onComplete: () => gsap.set(frame, { clearProps: "clipPath" }),
            };
            gsap.fromTo(
              frame,
              from,
              coarse
                ? {
                    ...to,
                    ease: "power3.out",
                    duration: 1,
                    scrollTrigger: { trigger: frame, start: "top 85%", once: true },
                  }
                : {
                    ...to,
                    scrollTrigger: { trigger: frame, start: "top 85%", end: "clamp(top 45%)", scrub: 1 },
                  }
            );
            gsap.fromTo(
              q("[data-hotspot]"),
              { scale: 0, opacity: 0 },
              {
                scale: 1,
                opacity: 1,
                duration: 0.6,
                stagger: 0.14,
                ease: "back.out(1.6)",
                clearProps: "transform",
                scrollTrigger: { trigger: frame, start: "top 60%", once: true },
              }
            );
          }

          // Tarjetas que se asientan desde una posición dispersa (drift de index2).
          q("[data-drift]").forEach((card, i) => {
            const d = DRIFT[i % DRIFT.length];
            gsap.fromTo(
              card,
              {
                y: 64,
                xPercent: small ? 0 : d.x,
                rotation: small ? 0 : d.r,
                opacity: 0,
                filter: blur(8),
              },
              {
                y: 0,
                xPercent: 0,
                rotation: 0,
                opacity: 1,
                filter: "blur(0px)",
                duration: 0.9,
                delay: i * 0.08,
                ease: "power3.out",
                clearProps: clear,
                scrollTrigger: { trigger: card, start: "top 88%", once: true },
              }
            );
          });

          // Contadores.
          q("[data-count]").forEach((el) => {
            const end = Number(el.getAttribute("data-count"));
            if (!Number.isFinite(end)) return;
            const obj = { n: 0 };
            el.textContent = "0";
            gsap.to(obj, {
              n: end,
              duration: 1.3,
              ease: "power2.out",
              onUpdate: () => {
                el.textContent = nf.format(Math.round(obj.n));
              },
              onComplete: () => {
                el.textContent = nf.format(end);
              },
              scrollTrigger: { trigger: el, start: "top 88%", once: true },
            });
          });

          // Tarjetas de la sección 2: aparecen en cascada.
          const rise = q("[data-rise]");
          if (rise.length) {
            gsap.fromTo(
              rise,
              { y: 56, opacity: 0, filter: blur(8) },
              {
                y: 0,
                opacity: 1,
                filter: "blur(0px)",
                duration: 0.85,
                stagger: 0.1,
                ease: "power3.out",
                clearProps: clear,
                scrollTrigger: { trigger: rise[0], start: "top 86%", once: true },
              }
            );
          }

          // Tarjetas de los agentes: suben en cascada y, ya asentada cada una, su mini-escena arma sus piezas una a una.
          // Es un bloque aparte del de arriba (`[data-rise]`): ése dispara todo junto cuando asoma la primera tarjeta.
          const agentCards = q("[data-agent]");
          agentCards.forEach((card, i) => {
            gsap.fromTo(
              card,
              { y: 56, opacity: 0, filter: blur(8) },
              {
                y: 0,
                opacity: 1,
                filter: "blur(0px)",
                duration: 0.85,
                delay: coarse ? 0 : i * 0.1,
                ease: "power3.out",
                clearProps: clear,
                scrollTrigger: { trigger: card, start: "top 88%", once: true },
              }
            );
            gsap.fromTo(
              card.querySelectorAll("[data-part]"),
              { y: 10, opacity: 0 },
              {
                y: 0,
                opacity: 1,
                duration: 0.5,
                delay: (coarse ? 0 : i * 0.1) + 0.45,
                stagger: 0.12,
                ease: "power2.out",
                clearProps: "transform",
                scrollTrigger: { trigger: card, start: "top 88%", once: true },
              }
            );
          });

          // Cierre: las líneas topográficas se dibujan con el scroll.
          q("[data-topo] path").forEach((path) => {
            // pathLength=1 normaliza el trazo: no depende de getTotalLength (en WebKit con el SVG
            // estirado quedaba más corto que el trazo real y la línea no se completaba).
            gsap.fromTo(
              path,
              { strokeDasharray: 1, strokeDashoffset: 1 },
              {
                strokeDashoffset: 0,
                ease: "none",
                scrollTrigger: { trigger: ".home-closing", start: "top 85%", end: "clamp(center 55%)", scrub: true },
              }
            );
          });

          // Parallax suave del abanico del hero (sólo con puntero fino).
          if (!coarse) {
            const stack = document.querySelector(".hero-stack");
            if (stack) {
              gsap.to(stack, {
                y: -36,
                ease: "none",
                scrollTrigger: { trigger: ".hero-main", start: "top top", end: "bottom top", scrub: true },
              });
            }
          }
        }
      );

      // Las fuentes cambian las alturas: recalcular los puntos de inicio.
      document.fonts?.ready.then(() => ScrollTrigger.refresh());

      return () => mm.revert();
    },
    { scope }
  );

  return (
    <div ref={scope} className="home-sections">
      <section className="home-section" aria-labelledby="home-showcase-title">
        <p className="hero-eyebrow home-eyebrow" data-reveal="">
          <span className="hero-eyebrow-dot" aria-hidden="true" />
          {SHOWCASE.eyebrow}
        </p>
        <h2 id="home-showcase-title" className="home-title" data-scrub-title="" aria-label={SHOWCASE.title}>
          <Chars text={SHOWCASE.title} />
        </h2>

        <div className="home-showcase-grid">
          <div className="home-frame" data-frame="">
            <svg viewBox="0 0 400 200" className="home-frame-art" fill="none" aria-hidden="true">
              <ellipse cx="200" cy="100" rx="180" ry="72" stroke="currentColor" strokeOpacity=".3" />
              <ellipse cx="200" cy="100" rx="92" ry="72" stroke="currentColor" strokeOpacity=".3" />
              <path d="M20 100h360M200 28v144" stroke="currentColor" strokeOpacity=".3" />
            </svg>
            {SHOWCASE.frame.hotspots.map((label, i) => (
              <span key={label} className="home-hotspot" data-hotspot="" data-i={i}>
                <span className="home-hotspot-dot" />
                {label}
              </span>
            ))}
            <div className="home-frame-copy">
              <span className="hero-chip">
                <Compass aria-hidden /> 360°
              </span>
              <h3>{SHOWCASE.frame.title}</h3>
              <p>{SHOWCASE.frame.text}</p>
            </div>
          </div>

          {SHOWCASE.cards.map((card, i) => (
            <article key={card.title} className="home-card" data-drift="">
              <span className="home-icon">{i === 0 ? <MapPin aria-hidden /> : <Heart aria-hidden />}</span>
              <h3>{card.title}</h3>
              <p>{card.text}</p>
            </article>
          ))}
        </div>
      </section>

      <HomeAgents agents={agents} />

      <section className="home-section" aria-labelledby="home-agencies-title">
        <p className="hero-eyebrow home-eyebrow" data-reveal="">
          <span className="hero-eyebrow-dot" aria-hidden="true" />
          {AGENCIES.eyebrow}
        </p>
        <h2 id="home-agencies-title" className="home-title" data-scrub-title="" aria-label={AGENCIES.title}>
          <Chars text={AGENCIES.title} />
        </h2>

        <div className="home-signals tabular-nums">
          {AGENCIES.signals.map((s) => (
            <div key={s.label} className="home-signal">
              <strong data-count={s.value}>{s.value}</strong>
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        <div className="home-agency-grid">
          {AGENCIES.cards.map((card) => (
            <article key={card.title} className="home-card" data-rise="">
              <CardArt kind={card.kind} />
              <h3>{card.title}</h3>
              <p>{card.text}</p>
            </article>
          ))}
        </div>

        <div className="home-cta-row" data-reveal="">
          <a
            href={secondaryCta.href}
            target={secondaryCta.external ? "_blank" : undefined}
            rel={secondaryCta.external ? "noopener noreferrer" : undefined}
            className={buttonClasses("primary", "lg", "hero-btn w-full sm:w-auto sm:min-w-[200px]")}
          >
            {secondaryCta.label}
          </a>
        </div>
      </section>

      <section className="home-closing" aria-labelledby="home-closing-title">
        <svg className="home-topo" data-topo="" viewBox="0 0 1200 360" preserveAspectRatio="none" fill="none" aria-hidden="true">
          <path d="M0 80C200 20 320 140 560 90S960 10 1200 70" pathLength={1} stroke="var(--accent)" strokeOpacity=".35" />
          <path d="M0 140C220 90 360 200 600 150S980 70 1200 130" pathLength={1} stroke="var(--text-muted)" strokeOpacity=".25" />
          <path d="M0 200C240 150 380 260 640 210S1000 130 1200 190" pathLength={1} stroke="var(--accent)" strokeOpacity=".25" />
          <path d="M0 260C260 210 400 320 680 270S1020 190 1200 250" pathLength={1} stroke="var(--text-muted)" strokeOpacity=".2" />
        </svg>
        <h2 id="home-closing-title" className="home-closing-title" data-scrub-title="" aria-label={CLOSING.title}>
          <Chars text={CLOSING.title} />
        </h2>
        <p className="home-closing-text" data-reveal="">
          {CLOSING.text}
        </p>
        <div className="home-cta-row home-cta-center" data-reveal="">
          <Link href="/mapa" className={buttonClasses("primary", "lg", "hero-btn w-full sm:w-auto sm:min-w-[200px]")}>
            Explorar propiedades
          </Link>
        </div>
      </section>
    </div>
  );
}
