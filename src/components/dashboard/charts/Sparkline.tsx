/**
 * Tendencia en miniatura para una stat tile: el período anterior en gris
 * (de-énfasis) y el período actual en el acento. Decorativa: el número de la
 * tile ya dice todo, por eso va oculta a lectores de pantalla.
 */
export function Sparkline({
  values,
  currentCount = 7,
  className,
}: {
  values: number[];
  /** Cuántos de los últimos puntos son el período actual (se dibujan en el acento). */
  currentCount?: number;
  className?: string;
}) {
  if (values.length < 2) return null;

  const W = 96;
  const H = 28;
  const PAD = 3; // deja lugar al punto final y a su anillo
  const max = Math.max(...values, 1);
  const step = (W - PAD * 2) / (values.length - 1);
  const point = (v: number, i: number) => [PAD + i * step, H - PAD - (v / max) * (H - PAD * 2)] as const;
  const toPoints = (from: number, to: number) =>
    values
      .slice(from, to + 1)
      .map((v, i) => point(v, from + i).map((n) => n.toFixed(1)).join(","))
      .join(" ");

  const split = Math.max(1, values.length - currentCount);
  const [lastX, lastY] = point(values[values.length - 1]!, values.length - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden focusable="false">
      <polyline points={toPoints(0, split)} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="stroke-text-muted/40" />
      <polyline points={toPoints(split, values.length - 1)} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="stroke-accent" />
      <circle cx={lastX} cy={lastY} r={3} strokeWidth={2} className="fill-accent stroke-surface" />
    </svg>
  );
}
