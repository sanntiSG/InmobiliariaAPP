"use client";

import { useRef, type ReactNode } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { HeroStats } from "@/lib/home/hero-stats";

/**
 * Bloque de texto del hero: eyebrow, titular letra a letra, subtítulo palabra a
 * palabra, prueba social con contadores y CTAs (llegan como `children`, así el
 * servidor decide cuáles). Un solo timeline de GSAP.
 *
 * Los caracteres se generan en el render (React es dueño del DOM). El estado
 * oculto inicial vive en CSS (`.js` + sin `prefers-reduced-motion`, ver
 * globals.css): sin JS o con movimiento reducido todo se ve de entrada.
 */

type Line = { text: string; strong?: boolean };

function Chars({ text }: { text: string }) {
  const words = text.split(" ");
  return words.map((word, i) => (
    <span key={i}>
      <span className="hero-word" aria-hidden="true">
        {[...word].map((ch, j) => (
          <span key={j} className="hero-char" data-hero-char="">
            {ch}
          </span>
        ))}
      </span>
      {i < words.length - 1 ? " " : null}
    </span>
  ));
}

function Words({ text }: { text: string }) {
  const words = text.split(" ");
  return words.map((word, i) => (
    <span key={i}>
      <span className="hero-sub-word" data-hero-word="">
        {word}
      </span>
      {i < words.length - 1 ? " " : null}
    </span>
  ));
}

const nf = new Intl.NumberFormat("es-AR");

export function HeroStage({
  eyebrow,
  lines,
  subtitle,
  stats,
  children,
}: {
  eyebrow: string;
  lines: Line[];
  subtitle: string;
  stats: HeroStats | null;
  children: ReactNode;
}) {
  const scope = useRef<HTMLDivElement>(null);

  const figures = stats
    ? ([
        { value: stats.properties, label: stats.properties === 1 ? "propiedad" : "propiedades" },
        { value: stats.agencies, label: stats.agencies === 1 ? "inmobiliaria" : "inmobiliarias" },
        { value: stats.tours, label: stats.tours === 1 ? "recorrido 360°" : "recorridos 360°" },
      ] as const).filter((f) => f.value > 0)
    : [];

  useGSAP(
    () => {
      const root = scope.current;
      if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      // El blur es lo más caro de pintar en mobile: ahí se anima sólo y/opacidad.
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const blur = (px: number) => (coarse ? "blur(0px)" : `blur(${px}px)`);
      const clear = coarse ? "transform" : "transform,filter";

      const q = gsap.utils.selector(root);
      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });

      tl.fromTo(
        q("[data-hero-eyebrow]"),
        { opacity: 0, y: 18, filter: blur(8) },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.65, clearProps: clear },
        0.08
      );
      tl.fromTo(
        q("[data-hero-char]"),
        { opacity: 0, y: 28, filter: blur(12) },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.68, stagger: 0.022, clearProps: clear },
        0.16
      );
      tl.fromTo(
        q("[data-hero-word]"),
        { opacity: 0, y: 16, filter: blur(8) },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.55, stagger: 0.02, clearProps: clear },
        0.55
      );
      tl.fromTo(
        q("[data-hero-proof]"),
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.55, clearProps: "transform" },
        0.78
      );
      tl.fromTo(
        q("[data-hero-cta]"),
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.55, stagger: 0.08, clearProps: "transform" },
        0.9
      );

      // Contadores: el HTML trae el número real; acá se cuenta desde 0.
      q("[data-hero-count]").forEach((el) => {
        const end = Number(el.getAttribute("data-hero-count"));
        if (!Number.isFinite(end)) return;
        const obj = { n: 0 };
        el.textContent = "0";
        tl.to(
          obj,
          {
            n: end,
            duration: 1.4,
            ease: "power2.out",
            onUpdate: () => {
              el.textContent = nf.format(Math.round(obj.n));
            },
            onComplete: () => {
              el.textContent = nf.format(end);
            },
          },
          0.85
        );
      });
    },
    { scope }
  );

  return (
    <div ref={scope} className="hero-text">
      <div className="hero-eyebrow" data-hero-eyebrow="">
        <span className="hero-eyebrow-dot" aria-hidden="true" />
        <span>{eyebrow}</span>
      </div>

      <h1 className="hero-headline" aria-label={lines.map((l) => l.text).join(" ")}>
        {lines.map((line) => (
          <span key={line.text} className={line.strong ? "hero-line hero-line-strong" : "hero-line"}>
            <Chars text={line.text} />
          </span>
        ))}
      </h1>

      <p className="hero-sub">
        <Words text={subtitle} />
      </p>

      <div className="hero-proof" data-hero-proof="">
        <div className="hero-avatars" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        {figures.length > 0 ? (
          <p className="hero-proof-text tabular-nums">
            {figures.map((f, i) => (
              <span key={f.label}>
                {i > 0 && <span className="hero-proof-sep" aria-hidden="true" />}
                <strong data-hero-count={f.value}>{nf.format(f.value)}</strong> {f.label}
              </span>
            ))}
          </p>
        ) : (
          <p className="hero-proof-text">Inmobiliarias de AMBA ya publican acá</p>
        )}
      </div>

      <div className="hero-actions">{children}</div>
    </div>
  );
}
