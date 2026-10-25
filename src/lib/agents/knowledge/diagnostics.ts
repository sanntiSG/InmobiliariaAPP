/**
 * Hallazgos del panel (los de "Rendimiento") agrupados y ordenados para mostrarlos como una lista corta de cosas por hacer.
 * Lo comparten el asesor ("¿qué me recomendás hacer?") y el panel ("Qué hacer hoy"): así los dos ordenan igual.
 */
import type { Diagnostic } from "@/lib/intelligence/diagnostics";
import { plural, quote } from "@/lib/advisor/compose/format";

const SEVERITY = { high: 3, medium: 2, low: 1 } as const;
const KIND = { attention: 3, opportunity: 2, positive: 0 } as const;

/** El hallazgo se agrupa por regla: "sumá 360°" en 5 propiedades es UNA acción, no cinco. */
export const ruleOf = (d: Diagnostic): string => (d.id.startsWith("agency-") ? d.id : d.id.split(":")[0]!);

/**
 * Agrupa hallazgos por regla y devuelve los `n` más importantes: "no tiene recorrido 360°" en 5
 * propiedades pasa a ser UN hallazgo ("…(5 propiedades)") con los nombres como evidencia.
 */
export function groupDiagnostics(candidates: Diagnostic[], n: number): Diagnostic[] {
  type Group = { rule: string; items: Diagnostic[]; weight: number };
  const groups = new Map<string, Group>();
  for (const d of candidates) {
    const rule = ruleOf(d);
    const g = groups.get(rule) ?? { rule, items: [], weight: 0 };
    g.items.push(d);
    groups.set(rule, g);
  }
  for (const g of groups.values()) {
    const top = Math.max(...g.items.map((d) => SEVERITY[d.severity] * 3 + KIND[d.kind]));
    g.weight = top + Math.min(4, g.items.length - 1);
  }

  return [...groups.values()]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, n)
    .map((g) => {
      const first = g.items[0]!;
      if (g.items.length === 1) return first;
      const names = g.items.slice(0, 3).map((d) => d.propertyTitle).filter(Boolean) as string[];
      return {
        ...first,
        id: `group:${g.rule}`,
        propertyId: undefined,
        propertyTitle: undefined,
        title: `${first.title} (${g.items.length} ${plural(g.items.length, "propiedad", "propiedades")})`,
        explanation: first.explanation,
        evidence: [{ label: "Propiedades", value: `${names.map((t) => quote(t, 28)).join(", ")}${g.items.length > 3 ? " y otras" : ""}` }],
        href: g.items.every((d) => d.href === first.href) ? first.href : "/dashboard/propiedades",
      };
    });
}
