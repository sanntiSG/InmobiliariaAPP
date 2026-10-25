import Link from "next/link";
import { ArrowRight, CircleCheck, Lightbulb, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { TodayItem } from "@/lib/intelligence/today";

const SEVERITY_TEXT = { high: "Urgente", medium: "Importante", low: "Cuando puedas" } as const;

/**
 * Lo que conviene hacer hoy, de lo más urgente a lo menos, sin repetidos. Cada renglón dice qué pasa, qué hacer y lleva
 * directo al lugar donde se resuelve. Entra escalonado (`rise-group`, sólo transform y opacidad).
 */
export function TodayList({ items }: { items: TodayItem[] }) {
  if (items.length === 0) {
    return (
      <p className="flex items-start gap-3 rounded-media bg-success-soft p-4 text-sm text-text">
        <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
        <span>
          <strong className="font-semibold">Todo en orden por hoy.</strong> No hay nada urgente ni oportunidades pendientes. Seguí publicando y mirando cómo evolucionan las visitas.
        </span>
      </p>
    );
  }

  return (
    <ol className="rise-group flex flex-col gap-3">
      {items.map((item, i) => {
        const attention = item.kind === "attention";
        const Icon = attention ? TriangleAlert : Lightbulb;
        return (
          <li key={item.id} className="flex gap-3.5 rounded-media bg-surface-2 p-4">
            <span
              className={cn(
                "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full",
                attention ? (item.severity === "high" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning") : "bg-accent-soft text-accent"
              )}
              aria-hidden
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-text-muted">
                <span className="font-mono tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <span>{attention ? "Para atender" : "Para aprovechar"}</span>
                <span aria-hidden>·</span>
                <span>{SEVERITY_TEXT[item.severity]}</span>
              </p>
              <h3 className="font-display text-base font-semibold text-text">{item.title}</h3>
              <p className="text-sm text-text-muted">{item.detail}</p>
              <Link href={item.href} className="group -my-2 mt-0 inline-flex w-fit items-center gap-1.5 py-3 text-sm font-semibold text-accent">
                {item.cta}
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
