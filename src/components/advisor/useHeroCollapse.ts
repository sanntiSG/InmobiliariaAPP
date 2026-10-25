"use client";

import { useCallback, useEffect, useRef } from "react";
import gsap from "gsap";

/** Alto de la mascota achicada (rem). Tiene que coincidir con el espacio que deja libre el velo en globals.css. */
const COMPACT_REM = 5;
const DESKTOP = "(min-width: 1024px)";
const REDUCED = "(prefers-reduced-motion: reduce)";

/**
 * La mascota del asesor se achica al deslizar la respuesta (sólo debajo de 1024 px, donde comparte
 * pantalla con el texto). En vez de un interruptor, el tamaño sigue al scroll de forma continua:
 *
 *   progreso = suavizado(scroll desde el ancla / lo que se achica)  →  seguido con inercia (power3.out)
 *
 * Así no hay saltos ni umbrales: cambia de dirección a mitad de camino y retoma desde donde estaba.
 * Sólo se escriben transformaciones (la mascota escala, un velo del color del fondo sube para tapar el
 * texto que pasa por debajo): el canvas 3D nunca cambia de tamaño y el layout no se recalcula, por eso
 * el alto del hilo ya no depende de la mascota y tampoco hay rebote entre grande y chica.
 */
export function useHeroCollapse(active: boolean) {
  const hero = useRef<HTMLElement>(null);
  const mascot = useRef<HTMLDivElement>(null);
  const veil = useRef<HTMLDivElement>(null);
  const driver = useRef<{ track(scrollTop: number): void; release(anchor: number): void } | null>(null);
  // Un hijo (la charla) monta antes que el marco que usa este hook: su primer `release` llega cuando todavía no hay
  // "conductor". Se guarda y se aplica apenas existe.
  const pendingAnchor = useRef<number | null>(null);

  useEffect(() => {
    const heroEl = hero.current;
    const mascotEl = mascot.current;
    const veilEl = veil.current;
    if (!active || !heroEl || !mascotEl || !veilEl) return;

    const desktop = window.matchMedia(DESKTOP);
    const reduced = window.matchMedia(REDUCED);
    const proxy = { p: 0 };
    let full = 0;
    let small = 0;
    let anchor = 0;

    const apply = () => {
      if (desktop.matches || full <= small) {
        mascotEl.style.transform = "";
        veilEl.style.transform = "";
        return;
      }
      mascotEl.style.transform = `scale(${1 - (1 - small / full) * proxy.p})`;
      veilEl.style.transform = `translate3d(0, ${-(full - small) * proxy.p}px, 0)`;
    };

    const measure = () => {
      full = heroEl.offsetHeight;
      small = COMPACT_REM * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
      apply();
    };
    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(heroEl);
    desktop.addEventListener("change", apply);

    const follow = gsap.quickTo(proxy, "p", { duration: 0.45, ease: "power3.out", onUpdate: apply });
    const to = (value: number) => {
      if (reduced.matches) {
        gsap.killTweensOf(proxy);
        proxy.p = value;
        apply();
      } else {
        follow(value);
      }
    };

    if (pendingAnchor.current != null) {
      anchor = pendingAnchor.current;
      pendingAnchor.current = null;
    }

    driver.current = {
      track(scrollTop) {
        const range = full - small;
        if (desktop.matches || range <= 0) return;
        const x = Math.min(1, Math.max(0, (scrollTop - anchor) / range));
        to(0.5 - Math.cos(Math.PI * x) / 2);
      },
      release(next) {
        anchor = next;
        to(0);
      },
    };

    return () => {
      driver.current = null;
      resizeObserver.disconnect();
      desktop.removeEventListener("change", apply);
      gsap.killTweensOf(proxy);
    };
  }, [active]);

  /** Seguir el scroll del hilo (`scrollTop`) cuando la persona lo desliza. */
  const track = useCallback((scrollTop: number) => driver.current?.track(scrollTop), []);
  /** Volver a grande: llegó una respuesta y el hilo se posicionó en `anchor` (el punto desde el que empieza a achicarse). */
  const release = useCallback((anchor: number) => {
    if (driver.current) driver.current.release(anchor);
    else pendingAnchor.current = anchor;
  }, []);

  return { hero, mascot, veil, track, release };
}
