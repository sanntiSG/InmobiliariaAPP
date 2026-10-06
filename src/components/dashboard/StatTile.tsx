import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Sparkline } from "./charts/Sparkline";

type Metric = { current: number; previous: number; deltaPct: number | null };

const nf = new Intl.NumberFormat("es-AR");
const FORMATS = {
  int: (n: number) => nf.format(n),
  seconds: (n: number) => (n >= 60 ? `${Math.floor(n / 60)} min ${n % 60 ? `${n % 60} s` : ""}`.trim() : `${n} s`),
} as const;

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
}: {
  label: string;
  metric: Metric;
  /** Serie diaria para la miniatura (los últimos 7 puntos son el período actual). */
  trend?: number[];
  format?: keyof typeof FORMATS;
  hint?: string;
  upIsGood?: boolean;
}) {
  const delta = metric.deltaPct;
  const up = (delta ?? 0) >= 0;
  const good = up === upIsGood;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="flex flex-col rounded-card bg-surface p-5 shadow-card">
      <p className="text-sm text-text-muted">{label}</p>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <p className="font-display text-3xl font-semibold text-text">{FORMATS[format](metric.current)}</p>
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
    </div>
  );
}
