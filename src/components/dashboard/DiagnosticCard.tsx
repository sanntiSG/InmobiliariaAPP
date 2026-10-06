import Link from "next/link";
import { ArrowRight, Lightbulb, TrendingUp, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Diagnostic, DiagnosticKind, DiagnosticSeverity } from "@/lib/intelligence/diagnostics";

const KIND = {
  attention: { icon: TriangleAlert, label: "Requiere atención", tone: "bg-warning-soft text-warning" },
  opportunity: { icon: Lightbulb, label: "Oportunidad", tone: "bg-accent-soft text-accent" },
  positive: { icon: TrendingUp, label: "Va bien", tone: "bg-success-soft text-success" },
} as const satisfies Record<DiagnosticKind, { icon: unknown; label: string; tone: string }>;

const SEVERITY_LABEL: Record<DiagnosticSeverity, string> = { high: "Prioridad alta", medium: "Prioridad media", low: "Prioridad baja" };

/**
 * Un hallazgo del sistema explicado en simple: qué está pasando, con los
 * números que lo respaldan, y qué se puede hacer (con un enlace directo).
 */
export function DiagnosticCard({ diagnostic: d, compact = false }: { diagnostic: Diagnostic; compact?: boolean }) {
  const { icon: Icon, label, tone } = KIND[d.kind];

  return (
    <article className="flex gap-4 rounded-card bg-surface p-5 shadow-card">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", tone)}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
          <span className="font-medium">{label}</span>
          <span aria-hidden>·</span>
          <span>{SEVERITY_LABEL[d.severity]}</span>
          {d.propertyTitle && (
            <>
              <span aria-hidden>·</span>
              <span className="min-w-0 truncate">{d.propertyTitle}</span>
            </>
          )}
        </div>
        <h3 className="font-display text-base font-semibold text-text">{d.title}</h3>
        <p className="text-sm text-text-muted">{d.explanation}</p>

        {!compact && d.evidence.length > 0 && (
          <dl className="flex flex-wrap gap-2">
            {d.evidence.map((e) => (
              <div key={e.label} className="rounded-pill bg-surface-2 px-3 py-1.5 text-xs">
                <dt className="inline text-text-muted">{e.label}: </dt>
                <dd className="inline font-semibold text-text">{e.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {d.action && (
          <p className="text-sm text-text">
            <span className="font-medium">Qué podés hacer: </span>
            {d.action}
          </p>
        )}
        {d.href && (
          <Link href={d.href} className="inline-flex w-fit items-center gap-1 text-sm font-medium text-accent hover:underline">
            Ir a resolverlo <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </div>
    </article>
  );
}
