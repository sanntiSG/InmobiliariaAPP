"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import type { Diagnostic, DiagnosticKind, DiagnosticSeverity } from "@/lib/intelligence/diagnostics";
import { DiagnosticCard } from "./DiagnosticCard";

type KindFilter = "todos" | DiagnosticKind;
type SeverityFilter = "todas" | DiagnosticSeverity;

const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "attention", label: "Requieren atención" },
  { value: "opportunity", label: "Oportunidades" },
  { value: "positive", label: "Van bien" },
];

const SEVERITY_OPTIONS: { value: SeverityFilter; label: string }[] = [
  { value: "todas", label: "Cualquier prioridad" },
  { value: "high", label: "Alta" },
  { value: "medium", label: "Media" },
  { value: "low", label: "Baja" },
];

/** Centro de oportunidades: todos los hallazgos con filtros por tipo y prioridad. */
export function OpportunitiesBoard({ items }: { items: Diagnostic[] }) {
  const [kind, setKind] = useState<KindFilter>("todos");
  const [severity, setSeverity] = useState<SeverityFilter>("todas");

  const visible = items.filter((d) => (kind === "todos" || d.kind === kind) && (severity === "todas" || d.severity === severity));
  const count = (k: KindFilter) => (k === "todos" ? items.length : items.filter((d) => d.kind === k).length);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtrar por tipo">
          {KIND_OPTIONS.map((o) => (
            <Chip key={o.value} active={kind === o.value} onClick={() => setKind(o.value)}>
              {o.label} ({count(o.value)})
            </Chip>
          ))}
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtrar por prioridad">
          {SEVERITY_OPTIONS.map((o) => (
            <Chip key={o.value} active={severity === o.value} onClick={() => setSeverity(o.value)} subtle>
              {o.label}
            </Chip>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-card bg-surface p-6 text-sm text-text-muted shadow-card">No hay hallazgos con estos filtros.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {visible.map((d) => (
            <DiagnosticCard key={d.id} diagnostic={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  subtle = false,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  subtle?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-pill px-3.5 py-2 text-sm font-medium transition-colors",
        active
          ? subtle
            ? "bg-accent-soft text-accent"
            : "bg-accent text-accent-contrast"
          : "bg-surface-2 text-text-muted hover:text-text"
      )}
    >
      {children}
    </button>
  );
}
