"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Cerca del tope el header siempre se ve; más abajo se oculta tras bajar este recorrido y vuelve tras subir menos. */
const ALWAYS_VISIBLE_BELOW = 64;
const HIDE_AFTER_PX = 12;
const SHOW_AFTER_PX = 6;

/**
 * Header fijo y sin línea divisoria para las pantallas que ocupan todo el celular (listado y ficha): arriba es
 * transparente (se funde con la barra de estado / isla dinámica), al bajar se desvanece y al subir reaparece rápido
 * (como la barra de Safari). Sólo mueve `transform` y `opacity`; el estado vive en atributos `data-*` que se
 * escriben directo en el DOM (sin re-renderizar React en cada gesto) y lo pinta `.scroll-header` en globals.css.
 */
export function ScrollHeader({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let lastY = Math.max(0, window.scrollY);
    let travel = 0; // recorrido acumulado en la dirección actual (+ bajando, − subiendo)
    let ticking = false;
    let hidden = false;

    const setHidden = (next: boolean) => {
      if (next === hidden) return;
      hidden = next;
      el.dataset.hidden = String(next);
    };

    const update = () => {
      ticking = false;
      // En iOS el rebote al llegar al tope o al final da valores fuera de rango: se recorta.
      const y = Math.min(Math.max(0, window.scrollY), document.documentElement.scrollHeight);
      const dy = y - lastY;
      lastY = y;
      el.dataset.scrolled = String(y > 8);

      if (y < ALWAYS_VISIBLE_BELOW) {
        travel = 0;
        setHidden(false);
        return;
      }
      if (dy === 0) return;
      travel = Math.sign(dy) === Math.sign(travel) ? travel + dy : dy;

      // Con un menú abierto o el foco adentro (teclado) no se esconde: sería perder lo que se está usando.
      const busy = el.contains(document.activeElement) || el.querySelector('[aria-expanded="true"]');
      if (travel > HIDE_AFTER_PX && !busy) setHidden(true);
      else if (travel < -SHOW_AFTER_PX) setHidden(false);
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    const onFocusIn = () => setHidden(false);

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("scroll", onScroll);
      el.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  return (
    <>
      {/* Mantiene legible la hora y la batería cuando el header está oculto (alto 0 si el dispositivo no tiene recorte). */}
      <div className="status-scrim" aria-hidden />
      <header ref={ref} className="scroll-header">
        <div className="scroll-header__bg" aria-hidden />
        <div className="relative pt-[var(--safe-top)]">{children}</div>
      </header>
    </>
  );
}
