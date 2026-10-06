"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils/cn";

export type TrendPoint = {
  /** ISO del día (medianoche, hora Argentina). */
  day: string;
  views: number;
  saves: number;
  likes: number;
  inquiries: number;
  contacts: number;
};

const HEIGHT = 200;
const M = { top: 12, right: 14, bottom: 26, left: 38 };
const fmt = new Intl.NumberFormat("es-AR");
const dayFmt = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires" });
const longDayFmt = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  day: "numeric",
  month: "long",
  timeZone: "America/Argentina/Buenos_Aires",
});

/** Máximo "redondo" (1, 2, 5 × 10ⁿ) para que los ticks queden en números limpios. */
function niceMax(value: number): number {
  if (value <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  const n = value / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/**
 * Tendencia diaria de visitas (una serie, en el acento): línea de 2 px, área al
 * 10 %, punto final con anillo y, al pasar el mouse o navegar con flechas, una
 * guía vertical con el detalle del día. Debajo, una vista de tabla con los
 * mismos números.
 */
export function TrendChart({ points, label, className }: { points: TrendPoint[]; label: string; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const n = points.length;
  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;
  const max = niceMax(Math.max(...points.map((p) => p.views), 0));
  const x = (i: number) => M.left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const y = (v: number) => M.top + plotH - (v / max) * plotH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.views).toFixed(1)}`).join(" ");
  const areaPath = n > 1 ? `${linePath} L${x(n - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : "";
  const ticks = [0, max / 2, max];
  const labelIdx = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : points.map((_, i) => i);

  function indexFromPointer(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = e.clientX - rect.left - M.left;
    return Math.min(n - 1, Math.max(0, Math.round((rel / Math.max(plotW, 1)) * (n - 1))));
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? n) - 1));
    else if (e.key === "ArrowRight") setActive((i) => Math.min(n - 1, (i ?? -1) + 1));
    else if (e.key === "Escape") setActive(null);
    else return;
    e.preventDefault();
  }

  const total = points.reduce((s, p) => s + p.views, 0);
  const current = active != null ? points[active] : null;
  const tipLeft = current ? Math.min(Math.max(x(active!) - 84, 4), Math.max(width - 172, 4)) : 0;

  return (
    <div className={className}>
      <div
        ref={wrapRef}
        className="relative touch-pan-y select-none outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-media"
        style={{ height: HEIGHT }}
        tabIndex={0}
        role="img"
        aria-label={`${label}: ${fmt.format(total)} en ${n} días. Usá las flechas para ver cada día.`}
        onPointerMove={width ? (e) => setActive(indexFromPointer(e)) : undefined}
        onPointerLeave={() => setActive(null)}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        {width > 0 && n > 0 && (
          <svg width={width} height={HEIGHT} aria-hidden focusable="false">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} strokeWidth={1} className="stroke-border" />
                <text x={M.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} className="fill-text-muted">
                  {fmt.format(Math.round(t))}
                </text>
              </g>
            ))}

            {areaPath && <path d={areaPath} className="fill-accent/10" />}
            <path d={linePath} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="stroke-accent" />

            {labelIdx.map((i) => (
              <text
                key={i}
                x={x(i)}
                y={HEIGHT - 6}
                textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
                fontSize={11}
                className="fill-text-muted"
              >
                {dayFmt.format(new Date(points[i]!.day))}
              </text>
            ))}

            {active != null && (
              <line x1={x(active)} x2={x(active)} y1={M.top} y2={M.top + plotH} strokeWidth={1} className="stroke-text-muted/50" />
            )}
            {/* Punto final (siempre) y punto activo, con anillo del color de la superficie. */}
            <circle cx={x(n - 1)} cy={y(points[n - 1]!.views)} r={4} strokeWidth={2} className="fill-accent stroke-surface" />
            {active != null && active !== n - 1 && (
              <circle cx={x(active)} cy={y(points[active]!.views)} r={4} strokeWidth={2} className="fill-accent stroke-surface" />
            )}
          </svg>
        )}

        {current && (
          <div
            className="pointer-events-none absolute top-1 z-10 w-[168px] rounded-media border border-border bg-surface px-3 py-2 shadow-float"
            style={{ left: tipLeft }}
          >
            <p className="text-xs capitalize text-text-muted">{longDayFmt.format(new Date(current.day))}</p>
            <p className="mt-1 flex items-center gap-2 text-sm">
              <span className="h-0.5 w-3.5 shrink-0 rounded-full bg-accent" aria-hidden />
              <span className="font-semibold text-text">{fmt.format(current.views)}</span>
              <span className="text-text-muted">visitas</span>
            </p>
            <p className="mt-0.5 text-xs text-text-muted">
              {fmt.format(current.saves)} guardados · {fmt.format(current.inquiries + current.contacts)} consultas
            </p>
          </div>
        )}
      </div>

      <details className="group mt-2 text-sm">
        <summary className="cursor-pointer list-none text-xs font-medium text-text-muted hover:text-text">
          <span className="group-open:hidden">Ver datos en tabla</span>
          <span className="hidden group-open:inline">Ocultar tabla</span>
        </summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-media border border-border">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface-2 text-text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Día</th>
                <th className="px-3 py-2 text-right font-medium">Visitas</th>
                <th className="px-3 py-2 text-right font-medium">Guardados</th>
                <th className="px-3 py-2 text-right font-medium">Consultas</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.day} className={cn("border-t border-border text-text")}>
                  <td className="px-3 py-1.5">{dayFmt.format(new Date(p.day))}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt.format(p.views)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt.format(p.saves)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt.format(p.inquiries + p.contacts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
