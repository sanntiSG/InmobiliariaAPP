/**
 * "Qué hacer hoy": una sola lista corta, sin repetidos, que junta lo que más urge (clientes sin atender) con los hallazgos
 * del panel agrupados por regla. Antes la portada mostraba "necesita atención" y "oportunidades" por separado y el mismo
 * hallazgo aparecía en las dos; acá cada cosa sale una sola vez, la más importante primero. Función pura.
 */
import { groupDiagnostics } from "@/lib/agents/knowledge/diagnostics";
import type { Diagnostic, DiagnosticSeverity } from "@/lib/intelligence/diagnostics";

export type TodayItem = {
  id: string;
  severity: DiagnosticSeverity;
  /** `attention` = algo que está mal; `opportunity` = algo que se puede aprovechar. */
  kind: "attention" | "opportunity";
  title: string;
  detail: string;
  href: string;
  cta: string;
};

export const TODAY_MAX = 5;

export function buildTodayList(input: { opportunities: Diagnostic[]; staleClients: number }, max = TODAY_MAX): TodayItem[] {
  const items: TodayItem[] = [];

  if (input.staleClients > 0) {
    const n = input.staleClients;
    items.push({
      id: "stale-clients",
      severity: n >= 3 ? "high" : "medium",
      kind: "attention",
      title: n === 1 ? "Hay 1 cliente sin seguimiento" : `Hay ${n} clientes sin seguimiento`,
      detail: "Son consultas que todavía no atendiste. Respondelas hoy: los contactos se enfrían rápido.",
      href: "/dashboard/clientes",
      cta: "Ver clientes",
    });
  }

  const rest = groupDiagnostics(
    input.opportunities.filter((d) => d.kind !== "positive"),
    Math.max(0, max - items.length)
  );
  for (const d of rest) {
    items.push({
      id: d.id,
      severity: d.severity,
      kind: d.kind === "attention" ? "attention" : "opportunity",
      title: d.title,
      detail: d.action || d.explanation,
      href: d.propertyId ? `/dashboard/propiedades/${d.propertyId}/estadisticas` : (d.href ?? "/dashboard/rendimiento?vista=mejorar"),
      cta: d.propertyId ? "Ver diagnóstico" : "Ir",
    });
  }
  return items;
}
