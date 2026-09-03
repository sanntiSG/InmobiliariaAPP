import { cn } from "@/lib/utils/cn";
import type { Recommendation } from "@/lib/analytics/agency-stats";

export function RecommendationsList({ recommendations }: { recommendations: Recommendation[] }) {
  if (recommendations.length === 0) {
    return (
      <div className="rounded-card bg-success-soft p-5 text-sm text-text">
        Todo en orden — no tenés recomendaciones pendientes esta semana.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {recommendations.map((rec) => (
        <div
          key={rec.id}
          className={cn(
            "flex items-start gap-3 rounded-card p-4 text-sm",
            rec.severity === "warning" ? "bg-warning-soft text-text" : "bg-accent-soft text-text"
          )}
        >
          <span
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
              rec.severity === "warning" ? "bg-warning text-white" : "bg-accent text-accent-contrast"
            )}
            aria-hidden
          >
            {rec.severity === "warning" ? "!" : "i"}
          </span>
          {rec.message}
        </div>
      ))}
    </div>
  );
}
