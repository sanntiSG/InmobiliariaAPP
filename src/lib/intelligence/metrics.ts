import { Types } from "mongoose";
import { PropertyDailyStat } from "@/lib/db/models/PropertyDailyStat";
import { Lead } from "@/lib/db/models/Lead";
import { dayStart } from "@/lib/tracking/record";
import { isLeadStale } from "@/lib/leads/status";

const DAY_MS = 86_400_000;

export const METRIC_FIELDS = [
  "views",
  "uniqueViews",
  "likes",
  "saves",
  "comments",
  "shares",
  "contacts",
  "inquiries",
  "tourOpens",
  "dwellMsTotal",
  "dwellSamples",
] as const;

export type MetricField = (typeof METRIC_FIELDS)[number];
export type Totals = Record<MetricField, number>;

export const emptyTotals = (): Totals => Object.fromEntries(METRIC_FIELDS.map((f) => [f, 0])) as Totals;

export function addTotals(a: Totals, b: Totals): Totals {
  const out = emptyTotals();
  for (const f of METRIC_FIELDS) out[f] = a[f] + b[f];
  return out;
}

/** Métricas de una propiedad en tres ventanas: últimos 7 días, los 7 anteriores y últimos 30. */
export type PropertyMetrics = { propertyId: string; agencyId: string; w7: Totals; p7: Totals; d30: Totals };

export type MetricsScope = { agencyId?: string | null; propertyIds?: string[] };

/** "Consultas" = consultas por formulario + clics de contacto (WhatsApp, llamada, email). */
export const consultas = (t: Totals) => t.inquiries + t.contacts;

/** Cociente seguro: `null` si no hay base para calcularlo. */
export const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

export const avgDwellSec = (t: Totals): number | null =>
  t.dwellSamples > 0 ? Math.round(t.dwellMsTotal / t.dwellSamples / 1000) : null;

/** Variación porcentual entre dos períodos. `null` si ambos son 0; 100 si antes no había nada. */
export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export function windows(now = new Date()) {
  const today = dayStart(now).getTime();
  return {
    c7Start: new Date(today - 6 * DAY_MS),
    p7Start: new Date(today - 13 * DAY_MS),
    d30Start: new Date(today - 29 * DAY_MS),
  };
}

function scopeMatch(scope: MetricsScope) {
  return {
    ...(scope.agencyId ? { agencyId: new Types.ObjectId(scope.agencyId) } : {}),
    ...(scope.propertyIds ? { propertyId: { $in: scope.propertyIds.map((id) => new Types.ObjectId(id)) } } : {}),
  };
}

/**
 * Métricas por propiedad (3 ventanas) en una sola agregación sobre el rollup
 * diario — nunca recorre el log `Interaction`.
 */
export async function getPropertyMetrics(scope: MetricsScope, now = new Date()): Promise<Map<string, PropertyMetrics>> {
  const { c7Start, p7Start, d30Start } = windows(now);

  const accumulators: Record<string, unknown> = { agencyId: { $first: "$agencyId" } };
  for (const f of METRIC_FIELDS) {
    accumulators[`w7_${f}`] = { $sum: { $cond: [{ $gte: ["$day", c7Start] }, `$${f}`, 0] } };
    accumulators[`p7_${f}`] = {
      $sum: { $cond: [{ $and: [{ $gte: ["$day", p7Start] }, { $lt: ["$day", c7Start] }] }, `$${f}`, 0] },
    };
    accumulators[`d30_${f}`] = { $sum: `$${f}` };
  }

  const rows = await PropertyDailyStat.aggregate([
    { $match: { ...scopeMatch(scope), day: { $gte: d30Start } } },
    { $group: { _id: "$propertyId", ...accumulators } },
  ]);

  const out = new Map<string, PropertyMetrics>();
  for (const row of rows) {
    const pick = (prefix: string): Totals => {
      const t = emptyTotals();
      for (const f of METRIC_FIELDS) t[f] = row[`${prefix}_${f}`] ?? 0;
      return t;
    };
    out.set(String(row._id), {
      propertyId: String(row._id),
      agencyId: String(row.agencyId),
      w7: pick("w7"),
      p7: pick("p7"),
      d30: pick("d30"),
    });
  }
  return out;
}

/** Suma de las métricas de varias propiedades (KPIs de una inmobiliaria o de la plataforma). */
export function sumMetrics(all: Iterable<PropertyMetrics>): { w7: Totals; p7: Totals; d30: Totals } {
  let w7 = emptyTotals();
  let p7 = emptyTotals();
  let d30 = emptyTotals();
  for (const m of all) {
    w7 = addTotals(w7, m.w7);
    p7 = addTotals(p7, m.p7);
    d30 = addTotals(d30, m.d30);
  }
  return { w7, p7, d30 };
}

export type DailyPoint = { day: string } & Pick<
  Totals,
  "views" | "uniqueViews" | "saves" | "likes" | "inquiries" | "contacts" | "shares" | "tourOpens"
>;

/** Serie diaria de los últimos `days` días (con ceros en los días sin actividad) — para gráficos de tendencia. */
export async function getDailySeries(scope: MetricsScope, days = 30, now = new Date()): Promise<DailyPoint[]> {
  const today = dayStart(now).getTime();
  const start = new Date(today - (days - 1) * DAY_MS);

  const rows = await PropertyDailyStat.aggregate([
    { $match: { ...scopeMatch(scope), day: { $gte: start } } },
    {
      $group: {
        _id: "$day",
        views: { $sum: "$views" },
        uniqueViews: { $sum: "$uniqueViews" },
        saves: { $sum: "$saves" },
        likes: { $sum: "$likes" },
        inquiries: { $sum: "$inquiries" },
        contacts: { $sum: "$contacts" },
        shares: { $sum: "$shares" },
        tourOpens: { $sum: "$tourOpens" },
      },
    },
  ]);
  const byDay = new Map(rows.map((r) => [new Date(r._id).getTime(), r]));

  const series: DailyPoint[] = [];
  for (let i = 0; i < days; i++) {
    const t = start.getTime() + i * DAY_MS;
    const r = byDay.get(t);
    series.push({
      day: new Date(t).toISOString(),
      views: r?.views ?? 0,
      uniqueViews: r?.uniqueViews ?? 0,
      saves: r?.saves ?? 0,
      likes: r?.likes ?? 0,
      inquiries: r?.inquiries ?? 0,
      contacts: r?.contacts ?? 0,
      shares: r?.shares ?? 0,
      tourOpens: r?.tourOpens ?? 0,
    });
  }
  return series;
}

/** Visitas por escena del recorrido 360° (últimos `days` días) — "ambientes más visitados". */
export async function getSceneVisits(propertyId: string, days = 30, now = new Date()): Promise<Map<string, number>> {
  const start = new Date(dayStart(now).getTime() - (days - 1) * DAY_MS);
  const rows = await PropertyDailyStat.find({ propertyId, day: { $gte: start } })
    .select("scenes")
    .lean();
  const out = new Map<string, number>();
  for (const row of rows) {
    for (const [sceneId, count] of Object.entries((row.scenes ?? {}) as Record<string, number>)) {
      out.set(sceneId, (out.get(sceneId) ?? 0) + count);
    }
  }
  return out;
}

export type LeadFunnel = {
  total: number;
  contacted: number;
  visitRequested: number;
  visitDone: number;
  offers: number;
  closed: number;
  stale: number;
};

const emptyFunnel = (): LeadFunnel => ({
  total: 0,
  contacted: 0,
  visitRequested: 0,
  visitDone: 0,
  offers: 0,
  closed: 0,
  stale: 0,
});

/** Embudo de clientes potenciales (últimos 90 días), total y por propiedad. */
export async function getLeadFunnels(
  scope: MetricsScope,
  now = Date.now()
): Promise<{ total: LeadFunnel; byProperty: Map<string, LeadFunnel> }> {
  const since = new Date(now - 90 * DAY_MS);
  const docs = await Lead.find({ ...scopeMatch({ agencyId: scope.agencyId }), createdAt: { $gte: since } })
    .select("propertyId status visitRequested visitDone offerMade createdAt lastContactAt")
    .limit(2000)
    .lean();

  const total = emptyFunnel();
  const byProperty = new Map<string, LeadFunnel>();
  for (const lead of docs) {
    const key = String(lead.propertyId);
    const f = byProperty.get(key) ?? emptyFunnel();
    byProperty.set(key, f);
    for (const target of [total, f]) {
      target.total += 1;
      if (lead.status !== "nuevo") target.contacted += 1;
      if (lead.visitRequested) target.visitRequested += 1;
      if (lead.visitDone) target.visitDone += 1;
      if (lead.offerMade) target.offers += 1;
      if (lead.status === "cerrado") target.closed += 1;
      if (isLeadStale(lead, now)) target.stale += 1;
    }
  }
  return { total, byProperty };
}

export type Funnels = {
  visitsToSaves: number | null;
  visitsToConsultas: number | null;
  consultasToVisits: number | null;
};

/** Las tres conversiones que pide el panel: visitas→favoritos, visitas→consultas, consultas→visitas presenciales. */
export function computeFunnels(t: Totals, leads: LeadFunnel): Funnels {
  return {
    visitsToSaves: ratio(t.saves, t.views),
    visitsToConsultas: ratio(consultas(t), t.views),
    consultasToVisits: ratio(leads.visitDone, leads.total),
  };
}
