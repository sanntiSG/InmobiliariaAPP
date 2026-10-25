import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { CountUp } from "@/components/ui/CountUp";
import type { MetricFormat } from "@/lib/utils/metric-format";
import { Sparkline } from "./charts/Sparkline";

type Metric = { current: number; previous: number; deltaPct: number | null };

/**
 * Stat tile: etiqueta · valor (proporcional, no tabular) · variación contra la
 * semana anterior · tendencia opcional. El color de la variación indica si el
 * cambio es bueno (`upIsGood`): menos "tiempo sin responder" sería bueno, más
 * visitas también — por defecto subir es bueno.
 */
export function StatTile({
  label,
  metric,
  trend,
  format = "int",
  hint,
  upIsGood = true,
  href,
  help,
}: {
  label: string;
  metric: Metric;
  /** Serie diaria para la miniatura (los últimos 7 puntos son el período actual). */
  trend?: number[];
  format?: MetricFormat;
  hint?: string;
  upIsGood?: boolean;
  /** Si viene, todo el recuadro es un enlace a donde se trabaja ese número. */
  href?: string;
  /** Qué mide, en una frase (se lee al pasar el mouse y con lector de pantalla). */
  help?: string;
}) {
  const delta = metric.deltaPct;
  const up = (delta ?? 0) >= 0;
  const good = up === upIsGood;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;

  const body = (
    <>
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-subtle">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="font-mono text-3xl font-medium tracking-tight text-text">
          <CountUp value={metric.current} format={format} />
        </p>
        {trend && <Sparkline values={trend} className="mb-1 h-7 w-24 shrink-0" />}
      </div>
      {delta != null ? (
        <p className={cn("mt-1.5 inline-flex items-center gap-1 text-sm font-medium", good ? "text-success" : "text-danger")}>
          <Arrow className="h-4 w-4" aria-hidden />
          {Math.abs(delta)}% vs. semana pasada
        </p>
      ) : (
        <p className="mt-1.5 text-sm text-text-muted">{hint ?? "Sin datos de la semana pasada"}</p>
      )}
    </>
  );

  const cls = "flex flex-col rounded-card bg-surface p-5 shadow-card";
  return href ? (
    <Link
      href={href}
      data-reveal
      title={help}
      className={cn(cls, "transition-[transform,box-shadow] duration-150 [transition-timing-function:var(--ease-out)] hover:-translate-y-0.5 hover:shadow-float active:scale-[0.99]")}
    >
      {body}
    </Link>
  ) : (
    <div data-reveal title={help} className={cls}>
      {body}
    </div>
  );
}
