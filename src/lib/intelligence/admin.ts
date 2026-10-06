import { Agency } from "@/lib/db/models/Agency";
import { AgencyRequest } from "@/lib/db/models/AgencyRequest";
import { Property } from "@/lib/db/models/Property";
import { User } from "@/lib/db/models/User";
import { dayStart } from "@/lib/tracking/record";
import { memo } from "./cache";
import {
  consultas,
  deltaPct,
  emptyTotals,
  getLeadFunnels,
  getPropertyMetrics,
  sumMetrics,
  type PropertyMetrics,
  type Totals,
} from "./metrics";
import { getIntelligence } from "./opportunities";
import { interestScore } from "./diagnostics";

const DAY_MS = 86_400_000;

export type AgencyActivity = {
  agencyId: string;
  name: string;
  published: number;
  views: number;
  viewsPrev: number;
  viewsDelta: number | null;
  saves: number;
  consultas: number;
  /** Puntaje de interés de los últimos 30 días (para ordenar). */
  score: number;
};

export type GrowthRow = { name: string; current: number; previous: number; deltaPct: number | null };

export type AdminAttention = {
  id: string;
  title: string;
  detail: string;
  href: string;
  severity: "high" | "medium" | "low";
};

export type AdminIntelligence = {
  totals: { w7: Totals; p7: Totals; d30: Totals };
  platform: {
    publishedProperties: number;
    activeAgencies: number;
    users: number;
    newUsers: { current: number; previous: number; deltaPct: number | null };
    newAgencies: { current: number; previous: number; deltaPct: number | null };
  };
  /** Inmobiliarias ordenadas por actividad. */
  agencies: AgencyActivity[];
  /** Propiedades con más interés de toda la plataforma. */
  topProperties: { id: string; title: string; slug: string; agencyName: string; score: number; views: number; saves: number; consultas: number }[];
  /** Crecimiento semana contra semana de cada tipo de interacción. */
  behaviors: GrowthRow[];
  /** Zonas y tipos de propiedad cuyas visitas más crecen. */
  growingZones: GrowthRow[];
  growingTypes: GrowthRow[];
  attention: AdminAttention[];
};

const growth = (name: string, current: number, previous: number): GrowthRow => ({
  name,
  current,
  previous,
  deltaPct: deltaPct(current, previous),
});

/** Cuántas visitas mínimas hacen falta para hablar de "crecimiento" (evita saltos de 1 a 3). */
const MIN_VIEWS_FOR_GROWTH = 10;

/**
 * Inteligencia global para el administrador: qué funciona, qué inmobiliarias
 * y propiedades generan más interés, qué comportamientos crecen y qué
 * requiere atención. Mismo motor y mismas fuentes que el panel de cada
 * inmobiliaria, sin filtrar por agencia. Cacheada 60 s.
 */
export function getAdminIntelligence(): Promise<AdminIntelligence> {
  return memo("admin-intelligence", 60_000, compute);
}

async function compute(): Promise<AdminIntelligence> {
  const now = Date.now();
  const [intel, metricsMap, agencies, properties, requestsPending, leadFunnels] = await Promise.all([
    getIntelligence(null),
    getPropertyMetrics({}),
    Agency.find({}).select("name status").lean(),
    Property.find({ status: "published" }).select("agencyId title slug type address.neighborhood").limit(5000).lean(),
    AgencyRequest.find({ status: "pending" }).select("name agencyName createdAt").sort({ createdAt: 1 }).limit(50).lean(),
    getLeadFunnels({}),
  ]);

  const totals = sumMetrics(metricsMap.values());

  // — Por inmobiliaria —
  const agencyName = new Map(agencies.map((a) => [String(a._id), a.name]));
  const publishedByAgency = new Map<string, number>();
  const propById = new Map(properties.map((p) => [String(p._id), p]));
  for (const p of properties) {
    const id = String(p.agencyId);
    publishedByAgency.set(id, (publishedByAgency.get(id) ?? 0) + 1);
  }
  const perAgency = new Map<string, { w7: Totals; p7: Totals; d30: Totals }>();
  const byAgency = new Map<string, PropertyMetrics[]>();
  for (const m of metricsMap.values()) byAgency.set(m.agencyId, [...(byAgency.get(m.agencyId) ?? []), m]);
  for (const [id, list] of byAgency) perAgency.set(id, sumMetrics(list));

  const agencyRows: AgencyActivity[] = agencies
    .filter((a) => a.status === "active")
    .map((a) => {
      const id = String(a._id);
      const t = perAgency.get(id) ?? { w7: emptyTotals(), p7: emptyTotals(), d30: emptyTotals() };
      return {
        agencyId: id,
        name: a.name,
        published: publishedByAgency.get(id) ?? 0,
        views: t.w7.views,
        viewsPrev: t.p7.views,
        viewsDelta: deltaPct(t.w7.views, t.p7.views),
        saves: t.w7.saves,
        consultas: consultas(t.w7),
        score: interestScore(t.d30),
      };
    })
    .sort((a, b) => b.score - a.score);

  // — Propiedades con más interés —
  const topProperties = intel.properties.slice(0, 8).filter((p) => p.score > 0).map((p) => {
    const doc = propById.get(p.id);
    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      agencyName: doc ? (agencyName.get(String(doc.agencyId)) ?? "—") : "—",
      score: p.score,
      views: p.d30.views,
      saves: p.d30.saves,
      consultas: consultas(p.d30),
    };
  });

  // — Qué comportamientos crecen —
  const behaviors: GrowthRow[] = [
    growth("Visitas", totals.w7.views, totals.p7.views),
    growth("Favoritos", totals.w7.saves, totals.p7.saves),
    growth("Me gusta", totals.w7.likes, totals.p7.likes),
    growth("Consultas", consultas(totals.w7), consultas(totals.p7)),
    growth("Compartidas", totals.w7.shares, totals.p7.shares),
    growth("Visitas a recorridos 360°", totals.w7.tourOpens, totals.p7.tourOpens),
  ];

  // — Zonas y tipos en alza —
  const zones = new Map<string, { w: number; p: number }>();
  const types = new Map<string, { w: number; p: number }>();
  const bump = (map: Map<string, { w: number; p: number }>, key: string, m: PropertyMetrics) => {
    const cur = map.get(key) ?? { w: 0, p: 0 };
    cur.w += m.w7.views;
    cur.p += m.p7.views;
    map.set(key, cur);
  };
  for (const m of metricsMap.values()) {
    const doc = propById.get(m.propertyId);
    if (!doc) continue;
    if (doc.address?.neighborhood) bump(zones, doc.address.neighborhood, m);
    bump(types, doc.type, m);
  }
  const rising = (map: Map<string, { w: number; p: number }>) =>
    [...map.entries()]
      .filter(([, v]) => v.w + v.p >= MIN_VIEWS_FOR_GROWTH)
      .map(([name, v]) => growth(name, v.w, v.p))
      .filter((r) => (r.deltaPct ?? 0) > 0)
      .sort((a, b) => (b.deltaPct ?? 0) - (a.deltaPct ?? 0) || b.current - a.current)
      .slice(0, 5);

  // — Plataforma y crecimiento de usuarios —
  const c7 = new Date(dayStart().getTime() - 6 * DAY_MS);
  const p7 = new Date(dayStart().getTime() - 13 * DAY_MS);
  const [users, newUsersNow, newUsersPrev, newAgenciesNow, newAgenciesPrev] = await Promise.all([
    User.countDocuments({ role: "user" }),
    User.countDocuments({ role: "user", createdAt: { $gte: c7 } }),
    User.countDocuments({ role: "user", createdAt: { $gte: p7, $lt: c7 } }),
    Agency.countDocuments({ createdAt: { $gte: c7 } }),
    Agency.countDocuments({ createdAt: { $gte: p7, $lt: c7 } }),
  ]);

  // — Qué requiere atención —
  const attention: AdminAttention[] = [];
  const stalePending = requestsPending.filter((r) => now - r.createdAt.getTime() > 48 * 3_600_000);
  if (requestsPending.length > 0) {
    attention.push({
      id: "pending-requests",
      title: `${requestsPending.length} ${requestsPending.length === 1 ? "solicitud" : "solicitudes"} de inmobiliaria pendientes`,
      detail:
        stalePending.length > 0
          ? `${stalePending.length} ${stalePending.length === 1 ? "lleva" : "llevan"} más de 48 horas sin resolverse.`
          : "Hablá con las personas y aprobalas o rechazalas.",
      href: "/admin/solicitudes",
      severity: stalePending.length > 0 ? "high" : "medium",
    });
  }
  if (leadFunnels.total.stale > 0) {
    attention.push({
      id: "stale-leads",
      title: `${leadFunnels.total.stale} ${leadFunnels.total.stale === 1 ? "cliente" : "clientes"} sin seguimiento en la plataforma`,
      detail: "Consultas que las inmobiliarias todavía no atendieron.",
      href: "/dashboard/clientes",
      severity: "medium",
    });
  }
  const noViews = agencyRows.filter((a) => a.published > 0 && a.views === 0 && a.viewsPrev === 0);
  if (noViews.length > 0 && totals.d30.views > 0) {
    attention.push({
      id: "inactive-agencies",
      title: `${noViews.length} ${noViews.length === 1 ? "inmobiliaria" : "inmobiliarias"} con propiedades publicadas y sin visitas en 14 días`,
      detail: noViews.slice(0, 3).map((a) => a.name).join(", ") + (noViews.length > 3 ? "…" : ""),
      href: "/admin",
      severity: "medium",
    });
  }
  const noListings = agencyRows.filter((a) => a.published === 0);
  if (noListings.length > 0) {
    attention.push({
      id: "agencies-without-listings",
      title: `${noListings.length} ${noListings.length === 1 ? "inmobiliaria activa" : "inmobiliarias activas"} sin propiedades publicadas`,
      detail: noListings.slice(0, 3).map((a) => a.name).join(", ") + (noListings.length > 3 ? "…" : ""),
      href: "/admin",
      severity: "low",
    });
  }
  const highSeverity = intel.opportunities.filter((o) => o.kind === "attention" && o.severity === "high").length;
  if (highSeverity > 0) {
    attention.push({
      id: "high-severity-findings",
      title: `${highSeverity} ${highSeverity === 1 ? "propiedad con un problema" : "propiedades con problemas"} de prioridad alta`,
      detail: "Por ejemplo, muchas visitas y pocas consultas, o clientes sin responder.",
      href: "/dashboard/oportunidades",
      severity: "medium",
    });
  }

  return {
    totals,
    platform: {
      publishedProperties: intel.published,
      activeAgencies: agencyRows.length,
      users,
      newUsers: { current: newUsersNow, previous: newUsersPrev, deltaPct: deltaPct(newUsersNow, newUsersPrev) },
      newAgencies: { current: newAgenciesNow, previous: newAgenciesPrev, deltaPct: deltaPct(newAgenciesNow, newAgenciesPrev) },
    },
    agencies: agencyRows,
    topProperties,
    behaviors,
    growingZones: rising(zones),
    growingTypes: rising(types),
    attention: attention.sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.severity] - ({ high: 0, medium: 1, low: 2 })[b.severity]),
  };
}
