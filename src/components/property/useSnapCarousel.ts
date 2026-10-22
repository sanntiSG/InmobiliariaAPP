"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/**
 * Carrusel horizontal con `scroll-snap` nativo: el navegador resuelve el arrastre con el dedo, la inercia y
 * el "imán" a cada foto; este hook sólo mantiene sincronizado el scroll con un índice que vive afuera
 * (miniaturas, contador, teclado). Cada diapositiva mide el ancho del contenedor.
 *
 *  - scroll → índice: `round(scrollLeft / ancho)`, avisando sólo cuando cambia de foto.
 *  - índice → scroll: `goTo(i)` (animado) o, si el índice cambia desde afuera, una alineación sin animación.
 *  - mientras dura un desplazamiento pedido por `goTo` se ignoran los avisos de scroll, así las fotos del
 *    medio no hacen parpadear las miniaturas.
 */
export function useSnapCarousel({
  count,
  index,
  onIndexChange,
}: {
  count: number;
  index: number;
  onIndexChange: (index: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const moving = useRef(false);
  const timer = useRef(0);
  const latest = useRef({ index, count, onIndexChange });
  useEffect(() => {
    latest.current = { index, count, onIndexChange };
  });

  const align = useCallback((i: number, smooth: boolean) => {
    const el = ref.current;
    if (!el) return;
    const left = i * el.clientWidth;
    if (Math.abs(el.scrollLeft - left) < 1) return;
    const animate = smooth && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (animate) {
      moving.current = true;
      window.clearTimeout(timer.current);
      // `scrollend` lo libera apenas termina; el temporizador cubre a los navegadores que no lo tienen.
      timer.current = window.setTimeout(() => (moving.current = false), 700);
    }
    el.scrollTo({ left, behavior: animate ? "smooth" : "auto" });
  }, []);

  const goTo = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(latest.current.count - 1, i));
      align(next, true);
      latest.current.onIndexChange(next);
    },
    [align]
  );

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el || moving.current || el.clientWidth === 0) return;
    const next = Math.max(0, Math.min(latest.current.count - 1, Math.round(el.scrollLeft / el.clientWidth)));
    if (next !== latest.current.index) latest.current.onIndexChange(next);
  }, []);

  // El índice cambió desde afuera (por ejemplo, al abrir el visor): se alinea sin animación y antes de pintar.
  useLayoutEffect(() => {
    if (moving.current) return;
    const el = ref.current;
    if (!el || el.clientWidth === 0) return;
    if (Math.round(el.scrollLeft / el.clientWidth) !== index) align(index, false);
  }, [index, align]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const release = () => {
      moving.current = false;
      window.clearTimeout(timer.current);
    };
    el.addEventListener("scrollend", release);
    // Si cambia el ancho (girar el celular), la foto activa se vuelve a alinear.
    const resizeObserver = new ResizeObserver(() => {
      if (!moving.current) align(latest.current.index, false);
    });
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener("scrollend", release);
      resizeObserver.disconnect();
      window.clearTimeout(timer.current);
    };
  }, [align]);

  return { ref, onScroll, goTo };
}
