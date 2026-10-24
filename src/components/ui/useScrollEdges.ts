"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Dice si una fila que se desliza tiene más contenido a la izquierda o a la derecha, para mostrar un degradé sólo
 * cuando hace falta (en una barra que entra completa no se dibuja nada). Escucha scroll pasivo y el tamaño del
 * contenedor; no vuelve a renderizar mientras los dos valores no cambien.
 */
export function useScrollEdges<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const start = el.scrollLeft > 4;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [measure]);

  return [ref, edges] as const;
}
