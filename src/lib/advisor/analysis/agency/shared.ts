/** Utilidades comunes a los handlers de inmobiliaria. */
import { PROPERTY_TYPE_LABELS, type PropertyType } from "@/config/filters";
import { THRESHOLDS, interestScore } from "@/lib/intelligence/diagnostics";
import {
  consultas,
  emptyTotals,
  getTotalsInRange,
  addTotals,
  type Totals,
} from "@/lib/intelligence/metrics";
import { n0, money, plural } from "../../compose/format";
import type { PropertyRow } from "../../data/portfolio";
import { periodRange } from "../../data/periods";
import type { MetricId, PeriodId, PropertyRef, Slots, Tone } from "../../types";
import { annotate } from "../correlate";
import type { AgencyEnv } from "../types";

/** Visitas mínimas para hablar de tasas: el mismo umbral que usan los diagnósticos del panel. */
export const MIN_VIEWS = THRESHOLDS.minViewsForRates;
export const DEFAULT_LIST = 5;
export const MAX_LIST = 8;

export const METRIC_LABELS: Record<MetricId, { one: string; many: string; short: string }> = {
  views: { one: "visita", many: "visitas", short: "visitas" },
  inquiries: { one: "consulta", many: "consultas", short: "consultas" },
  saves: { one: "favorito", many: "favoritos", short: "favoritos" },
  likes: { one: "me gusta", many: "me gusta", short: "me gusta" },
  shares: { one: "vez compartida", many: "veces compartida", short: "compartidas" },
  tour: { one: "apertura del 360°", many: "aperturas del 360°", short: "recorridos 360°" },
  dwell: { one: "segundo de permanencia", many: "segundos de permanencia", short: "permanencia" },
  interest: { one: "punto de interés", many: "puntos de interés", short: "interés" },
  conversion: { one: "% de consulta", many: "% de consulta", short: "conversión" },
};

export function metricValue(t: Totals, metric: MetricId): number {
  switch (metric) {
    case "views":
      return t.views;
    case "inquiries":
      return consultas(t);
    case "saves":
      return t.saves;
    case "likes":
      return t.likes;
    case "shares":
      return t.shares;
    case "tour":
      return t.tourOpens;
    case "dwell":
      return t.dwellSamples > 0 ? Math.round(t.dwellMsTotal / t.dwellSamples / 1000) : 0;
    case "conversion":
      return t.views > 0 ? (consultas(t) / t.views) * 100 : 0;
    case "interest":
      return interestScore(t);
  }
}

/** Totales por propiedad en el período pedido (reusa lo ya calculado en 7/30 días; el resto, una agregación). */
export async function totalsByProperty(env: AgencyEnv, period: PeriodId): Promise<Map<string, Totals>> {
  const { rows } = env.portfolio;
  if (period === "week") return new Map(rows.map((r) => [r.id, r.w7]));
  if (period === "prev_week") return new Map(rows.map((r) => [r.id, r.p7]));
  if (period === "month") return new Map(rows.map((r) => [r.id, r.d30]));
  const range = periodRange(period, env.now);
  const found = await getTotalsInRange({ propertyIds: rows.map((r) => r.id) }, range.from, range.to);
  return new Map(rows.map((r) => [r.id, found.get(r.id) ?? emptyTotals()]));
}

export function sumTotals(map: Map<string, Totals>): Totals {
  let acc = emptyTotals();
  for (const t of map.values()) acc = addTotals(acc, t);
  return acc;
}

/** Aplica zona / tipo / operación pedidos en la pregunta (si los hay). */
export function filterRows(rows: PropertyRow[], slots: Slots): PropertyRow[] {
  const zones = slots.zones?.map((z) => z.toLowerCase());
  return rows.filter(
    (r) =>
      (!slots.types?.length || (slots.types as string[]).includes(r.type)) &&
      (!slots.operation || r.operation === slots.operation) &&
      (!zones?.length || zones.includes((r.neighborhood ?? "").toLowerCase()) || zones.includes(r.city.toLowerCase()))
  );
}

const TYPE_INFO: Record<string, { sg: string; pl: string; f: boolean }> = {
  casa: { sg: "casa", pl: "casas", f: true },
  departamento: { sg: "departamento", pl: "departamentos", f: false },
  ph: { sg: "PH", pl: "PH", f: false },
  terreno: { sg: "terreno", pl: "terrenos", f: false },
  local: { sg: "local", pl: "locales", f: false },
  oficina: { sg: "oficina", pl: "oficinas", f: true },
  galpon: { sg: "galpón", pl: "galpones", f: false },
  quinta: { sg: "quinta", pl: "quintas", f: true },
};

/** "casas", "departamentos", "locales" (plural correcto) o el singular con `many = false`. */
export const typeLabel = (type: string, many = true): string => {
  const info = TYPE_INFO[type];
  if (info) return many ? info.pl : info.sg;
  return (PROPERTY_TYPE_LABELS[type as PropertyType] ?? type).toLowerCase();
};

/** Artículo y "cada uno/una" según el género del tipo ("las casas", "los departamentos"). */
export const typeGender = (type: string): { the: string; each: string } =>
  TYPE_INFO[type]?.f ? { the: "las", each: "cada una" } : { the: "los", each: "cada uno" };

export const zoneOf = (r: PropertyRow): string => r.neighborhood ?? r.city;

/** Descripción corta de los filtros aplicados ("departamentos de Ezeiza"), o "" si no hay. */
export function filterText(slots: Slots): string {
  const types = slots.types?.length ? slots.types.map((t) => typeLabel(t)).join(" y ") : "";
  const zones = slots.zones?.length ? slots.zones.join(" y ") : "";
  if (types && zones) return `${types} de ${zones}`;
  return types || (zones ? `propiedades de ${zones}` : "");
}

// ─── Referencias a propiedades ───────────────────────────────────────────────

export const editHref = (r: PropertyRow) => `/dashboard/propiedades/${r.id}/editar`;
export const statsHref = (r: PropertyRow) => `/dashboard/propiedades/${r.id}/estadisticas`;

export function metricChips(t: Totals): string[] {
  const chips = [`${n0(t.views)} ${plural(t.views, "visita", "visitas")}`];
  const c = consultas(t);
  chips.push(`${n0(c)} ${plural(c, "consulta", "consultas")}`);
  if (t.saves > 0) chips.push(`${n0(t.saves)} ${plural(t.saves, "favorito", "favoritos")}`);
  return chips;
}

export function priceText(r: PropertyRow): string {
  return `${money(r.price, r.currency)}${r.period === "mensual" ? "/mes" : ""}`;
}

export function propRef(
  row: PropertyRow,
  env: AgencyEnv,
  opts: { totals?: Totals; chips?: string[]; note?: string; tone?: Tone; auto?: boolean } = {}
): PropertyRef {
  const published = row.status === "published";
  const auto = opts.auto === false ? {} : annotate(row, env.portfolio, env.now);
  const place = [zoneOf(row), env.scope.agencyId === null && row.agencyName ? row.agencyName : null].filter(Boolean).join(" · ");
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    image: row.cover,
    place: place || null,
    price: priceText(row),
    chips: opts.chips ?? (opts.totals ? metricChips(opts.totals) : []),
    note: opts.note ?? auto.note,
    tone: opts.tone ?? auto.tone,
    href: published ? statsHref(row) : editHref(row),
    links: [
      ...(published ? [{ label: "Estadísticas", href: statsHref(row) }] : []),
      { label: "Editar", href: editHref(row) },
      ...(published ? [{ label: "Ver ficha", href: `/propiedades/${row.slug}` }] : []),
    ],
  };
}

/** ¿La plataforma casi no midió tráfico? Con tan pocos datos cualquier ranking sería ruido. */
export function hasThinData(env: AgencyEnv): boolean {
  const t = env.portfolio.intel.totals.d30;
  return t.views < 20;
}

export const THIN_DATA_TEXT =
  "Todavía hay muy pocas visitas medidas como para sacar conclusiones firmes: tomá estos números como una primera pista y volvé a preguntarme cuando haya más tráfico.";

/** Resuelve las propiedades a las que se refiere la pregunta: las nombradas, o las mostradas antes. */
export function targetRows(env: AgencyEnv, opts: { fallbackToResults?: boolean } = {}): PropertyRow[] {
  const { portfolio, slots, context } = env;
  const ids = slots.propertyIds?.length ? slots.propertyIds : opts.fallbackToResults === false ? [] : (context.resultIds ?? []);
  const rows = ids.map((id) => portfolio.byId.get(id)).filter((r): r is PropertyRow => !!r);
  if (rows.length > 0) return rows;
  if (context.focusPropertyId && !slots.propertyIds?.length) {
    const focus = portfolio.byId.get(context.focusPropertyId);
    if (focus) return [focus];
  }
  return [];
}
