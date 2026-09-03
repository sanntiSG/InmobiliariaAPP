import { cn } from "@/lib/utils/cn";
import type { WeeklyMetric } from "@/lib/analytics/agency-stats";

/** Stat tile: label · value (proporcional, no tabular — ver skill dataviz) · delta semanal. */
export function StatTile({ label, metric }: { label: string; metric: WeeklyMetric }) {
  const positive = (metric.deltaPct ?? 0) >= 0;

  return (
    <div className="rounded-card bg-surface p-5 shadow-card">
      <p className="text-sm text-text-muted">{label}</p>
      <p className="mt-1.5 font-display text-3xl font-semibold text-text">
        {new Intl.NumberFormat("es-AR").format(metric.current)}
      </p>
      {metric.deltaPct != null && (
        <p className={cn("mt-1.5 text-sm font-medium", positive ? "text-success" : "text-danger")}>
          {positive ? "↑" : "↓"} {Math.abs(metric.deltaPct)}% vs. semana pasada
        </p>
      )}
    </div>
  );
}
