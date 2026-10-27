/**
 * Límites de los controles deslizantes de los filtros, a partir de lo que realmente hay publicado (ver `facets.ts`). Un precio en
 * pesos y uno en dólares no se parecen en nada, y un alquiler y una venta tampoco: por eso cada moneda y cada operación tiene su
 * propio rango, redondeado a un número "lindo" para que el control se vea limpio. Puro.
 */
import type { Facets } from "./facets";

/** Redondea hacia arriba a 1, 2, 2,5, 5 o 10 por una potencia de diez (97.000 → 100.000; 1.340 → 2.000). */
export function niceCeil(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const power = 10 ** Math.floor(Math.log10(n));
  const m = n / power;
  const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return nice * power;
}

/** Un paso cómodo para un control que va de 0 a `max` (unos 100 pasos, en 1, 2 o 5 por una potencia de diez). */
export function niceStep(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1;
  const raw = max / 100;
  const power = 10 ** Math.floor(Math.log10(raw));
  const m = raw / power;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * power;
}

export type SliderBounds = { min: number; max: number; step: number };

/** Rango del control de precio para una moneda (y operación, si se eligió): `null` si no hay nada publicado en esa moneda. */
export function priceBounds(facets: Pick<Facets, "prices"> | null, currency: string | null, operation: string | null): SliderBounds | null {
  if (!facets || !currency) return null;
  const rows = facets.prices.filter((p) => p.currency === currency && (!operation || operation === "todas" || p.operation === operation));
  if (rows.length === 0) return null;
  const max = niceCeil(Math.max(...rows.map((r) => r.max)));
  return max > 0 ? { min: 0, max, step: niceStep(max) } : null;
}

/** Rango del control de superficie (m²): hasta el inmueble más grande publicado, en saltos de 5 o más. */
export function areaBounds(facets: Pick<Facets, "maxArea"> | null): SliderBounds {
  const max = niceCeil(facets?.maxArea || 500);
  return { min: 0, max, step: Math.max(5, niceStep(max)) };
}
