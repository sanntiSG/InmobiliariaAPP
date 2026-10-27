"use client";

import { useSyncExternalStore } from "react";

/**
 * ¿Se cumple una media query? En el servidor y en la primera pintura del cliente vale `fallback` (así la hidratación no discrepa);
 * después sigue a la pantalla en vivo. Sin estado ni efectos: usa `useSyncExternalStore`.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => fallback
  );
}
