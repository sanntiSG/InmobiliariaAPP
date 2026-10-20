/**
 * Cruza cada propiedad de una respuesta con lo que la inmobiliaria hizo y con
 * los diagnósticos ya calculados, para que el asesor aporte contexto en vez de
 * repetir números: "Bajaste el precio hace 5 días", "Tiene 2 fotos".
 */
import type { Diagnostic } from "@/lib/intelligence/diagnostics";
import { describeChange } from "../compose/activity-text";
import { daysAgo } from "../compose/format";
import type { ActivityEntry } from "../data/activity";
import type { Portfolio, PropertyRow } from "../data/portfolio";
import type { Tone } from "../types";

const DAY_MS = 86_400_000;

/** Cambios (de propiedades) hechos sobre una propiedad en los últimos `days` días, más nuevo primero. */
export function recentChanges(portfolio: Portfolio, propertyId: string, days: number, now: Date): ActivityEntry[] {
  const since = now.getTime() - days * DAY_MS;
  return portfolio.activity.filter(
    (e) => e.propertyId === propertyId && e.at.getTime() >= since && (e.kind === "property_updated" || e.kind === "property_created")
  );
}

/** Los campos que se consideran "movimientos" que pueden mover las métricas. */
export const IMPACT_FIELDS = ["price", "description", "photos", "cover", "videos", "tour360", "virtualTour", "status", "title"];

export type Note = { note?: string; tone?: Tone };

/**
 * Una línea de contexto para una propiedad: primero lo que se cambió hace poco
 * (es lo más probable que explique un movimiento), después su hallazgo más
 * importante. `focus` permite pedir sólo uno de los dos tipos.
 */
export function annotate(row: PropertyRow, portfolio: Portfolio, now: Date, focus: "any" | "diagnostic" = "any"): Note {
  if (focus === "any") {
    const entry = recentChanges(portfolio, row.id, 21, now).find((e) => e.changes.some((c) => IMPACT_FIELDS.includes(c.field)));
    const change = entry?.changes.find((c) => IMPACT_FIELDS.includes(c.field));
    if (entry && change) {
      const { text } = describeChange(change);
      return { note: `${text} ${daysAgo(entry.at, now)}.`, tone: "neutral" };
    }
  }
  const top = topDiagnostic(row);
  if (top) {
    return { note: top.title, tone: top.kind === "positive" ? "good" : top.kind === "attention" ? "bad" : "neutral" };
  }
  return {};
}

const SEVERITY = { high: 3, medium: 2, low: 1 } as const;

/** El hallazgo más importante de la propiedad (atención > oportunidad > positivo, y por severidad). */
export function topDiagnostic(row: PropertyRow): Diagnostic | null {
  const order = { attention: 3, opportunity: 2, positive: 1 } as const;
  return (
    [...row.diagnostics].sort((a, b) => SEVERITY[b.severity] - SEVERITY[a.severity] || order[b.kind] - order[a.kind])[0] ?? null
  );
}
