import { Types } from "mongoose";
import { Property } from "@/lib/db/models/Property";
import { benchFor, getBenchmarks } from "./benchmarks";
import { memo } from "./cache";
import {
  diagnoseProperty,
  dominantInteraction,
  interestScore,
  sortDiagnostics,
  type Diagnostic,
  type InteractionKind,
} from "./diagnostics";
import {
  computeFunnels,
  deltaPct,
  emptyTotals,
  getLeadFunnels,
  getPropertyMetrics,
  sumMetrics,
  type Funnels,
  type LeadFunnel,
  type PropertyMetrics,
  type Totals,
} from "./metrics";

const DAY_MS = 86_400_000;
const INTELLIGENCE_TTL_MS = 60_000;
const MAX_PROPERTIES = 500;

export type PropertyInsight = {
  id: string;
  title: string;
  slug: string;
  image: string | null;
  neighborhood: string | null;
  d30: Totals;
  w7: Totals;
  score: number;
  dominant: InteractionKind | null;
  diagnostics: Diagnostic[];
};

export type Intelligence = {
  published: number;
  totals: { w7: Totals; p7: Totals; d30: Totals };
  funnels: Funnels;
  leads: LeadFunnel;
  /** Todas las propiedades publicadas con su diagnóstico, ordenadas por interés. */
  properties: PropertyInsight[];
  /** Las que más interés generan. */
  working: PropertyInsight[];
  /** Las que necesitan atención (hallazgos de severidad alta o media). */
  needsAttention: PropertyInsight[];
  /** Todos los hallazgos (de propiedades y de la inmobiliaria), del más al menos importante. */
  opportunities: Diagnostic[];
};

/**
 * Inteligencia central de una inmobiliaria (o de toda la plataforma con
 * `agencyId: null`): junta métricas, comparación con propiedades similares,
 * embudos de clientes y reglas de diagnóstico en un solo resultado. Es la
 * fuente de datos del panel, del centro de oportunidades, de los diagnósticos
 * por propiedad y de las notificaciones de oportunidad.
 *
 * Cacheada 60 s por inmobiliaria: el panel y el centro de oportunidades la
 * piden en cada navegación.
 */
export function getIntelligence(agencyId: string | null): Promise<Intelligence> {
  return memo(`intelligence:${agencyId ?? "all"}`, INTELLIGENCE_TTL_MS, () => computeIntelligence(agencyId));
}

async function computeIntelligence(agencyId: string | null): Promise<Intelligence> {
  const scope = { agencyId };
  const [docs, metricsMap, benchmarks, leadFunnels] = await Promise.all([
    Property.find({ status: "published", ...(agencyId ? { agencyId: new Types.ObjectId(agencyId) } : {}) })
      .select(
        "title slug type operation publishedAt priceHistory media.images media.videos media.hasTour3d description address.neighborhood features.bedrooms features.totalArea features.coveredArea"
      )
      .limit(MAX_PROPERTIES)
      .lean(),
    getPropertyMetrics(scope),
    getBenchmarks(),
    getLeadFunnels(scope),
  ]);

  const now = Date.now();
  const properties: PropertyInsight[] = docs.map((doc) => {
    const id = String(doc._id);
    const metrics: PropertyMetrics | null = metricsMap.get(id) ?? null;
    const history = doc.priceHistory ?? [];
    // priceHistory[0] es el precio inicial; sólo cuenta como "cambio" desde la 2ª entrada.
    const lastChange = history.length > 1 ? history[history.length - 1]!.changedAt : null;

    const diagnostics = diagnoseProperty({
      property: {
        id,
        title: doc.title,
        type: doc.type,
        operation: doc.operation,
        publishedAt: doc.publishedAt ? new Date(doc.publishedAt) : null,
        priceChangedAt: lastChange ? new Date(lastChange) : null,
        imageCount: doc.media?.images?.length ?? 0,
        descriptionLength: (doc.description ?? "").trim().length,
        videoCount: doc.media?.videos?.length ?? 0,
        hasTour: !!doc.media?.hasTour3d,
        hasArea: !!(doc.features?.totalArea || doc.features?.coveredArea),
        hasBedrooms: doc.features?.bedrooms != null,
      },
      metrics,
      bench: benchFor(benchmarks, doc.type, doc.operation),
      leads: leadFunnels.byProperty.get(id) ?? null,
      now,
    });

    const d30 = metrics?.d30 ?? emptyTotals();
    const cover = doc.media?.images?.length
      ? [...doc.media.images].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0]
      : undefined;

    return {
      id,
      title: doc.title,
      slug: doc.slug,
      image: cover?.url ?? null,
      neighborhood: doc.address?.neighborhood ?? null,
      d30,
      w7: metrics?.w7 ?? emptyTotals(),
      score: interestScore(d30),
      dominant: dominantInteraction(d30),
      diagnostics,
    };
  });

  properties.sort((a, b) => b.score - a.score);

  const totals = sumMetrics(properties.filter((p) => metricsMap.has(p.id)).map((p) => metricsMap.get(p.id)!));
  const leads = leadFunnels.total;

  const agencyLevel = agencyId ? await agencyDiagnostics(agencyId, docs, totals, now) : [];
  const opportunities = sortDiagnostics([...agencyLevel, ...properties.flatMap((p) => p.diagnostics)]);

  const needsAttention = properties
    .filter((p) => p.diagnostics.some((d) => d.kind === "attention" && d.severity !== "low"))
    .sort(
      (a, b) =>
        Number(b.diagnostics.some((d) => d.kind === "attention" && d.severity === "high")) -
          Number(a.diagnostics.some((d) => d.kind === "attention" && d.severity === "high")) || b.score - a.score
    );

  return {
    published: properties.length,
    totals,
    funnels: computeFunnels(totals.d30, leads),
    leads,
    properties,
    working: properties.filter((p) => p.score > 0).slice(0, 3),
    needsAttention: needsAttention.slice(0, 3),
    opportunities,
  };
}

/** Hallazgos a nivel de toda la inmobiliaria (no de una propiedad puntual). */
async function agencyDiagnostics(
  agencyId: string,
  docs: { address?: { neighborhood?: string | null } | null; publishedAt?: Date | string | null }[],
  totals: { w7: Totals; p7: Totals },
  now: number
): Promise<Diagnostic[]> {
  const out: Diagnostic[] = [];
  const base = { propertyId: undefined, propertyTitle: undefined };

  // Visitas en baja.
  const change = deltaPct(totals.w7.views, totals.p7.views);
  if (change != null && totals.p7.views >= 20 && change <= -15) {
    out.push({
      ...base,
      id: `agency-views-down:${agencyId}`,
      kind: "attention",
      severity: "medium",
      title: "Bajaron las visitas",
      explanation: `Las visitas a tus propiedades bajaron ${Math.abs(change)}% respecto de la semana pasada (${totals.w7.views} contra ${totals.p7.views}).`,
      action: "Subí fotos nuevas, sumá videos o un recorrido 360° para reactivar el interés.",
      href: "/dashboard/propiedades",
      evidence: [
        { label: "Visitas esta semana", value: String(totals.w7.views) },
        { label: "Semana anterior", value: String(totals.p7.views) },
      ],
    });
  }

  // Pocas propiedades.
  if (docs.length < 3) {
    out.push({
      ...base,
      id: `agency-few-properties:${agencyId}`,
      kind: "opportunity",
      severity: "low",
      title: "Pocas propiedades publicadas",
      explanation: `Tenés ${docs.length} ${docs.length === 1 ? "propiedad publicada" : "propiedades publicadas"}. Más propiedades aumentan tu alcance en el mapa y el listado.`,
      action: "Publicá nuevas propiedades desde tu panel.",
      href: "/dashboard/propiedades/nueva",
      evidence: [{ label: "Publicadas", value: String(docs.length) }],
    });
  }

  // Hace mucho que no publica.
  const lastPublished = docs
    .map((d) => (d.publishedAt ? new Date(d.publishedAt).getTime() : 0))
    .reduce((max, t) => Math.max(max, t), 0);
  if (docs.length > 0 && lastPublished > 0 && now - lastPublished > 30 * DAY_MS) {
    out.push({
      ...base,
      id: `agency-stale-publishing:${agencyId}`,
      kind: "attention",
      severity: "low",
      title: "Hace más de 30 días que no publicás",
      explanation: "Las inmobiliarias que publican seguido aparecen más veces como novedad y reciben más visitas.",
      action: "Sumá una propiedad nueva para volver a aparecer como novedad.",
      href: "/dashboard/propiedades/nueva",
      evidence: [{ label: "Días sin publicar", value: String(Math.floor((now - lastPublished) / DAY_MS)) }],
    });
  }

  // Demanda sin oferta propia.
  const own = new Set(docs.map((d) => d.address?.neighborhood).filter(Boolean) as string[]);
  const demand = await getDemandByNeighborhood();
  for (const zone of demand.filter((z) => !own.has(z.neighborhood)).slice(0, 2)) {
    out.push({
      ...base,
      id: `agency-demand-gap:${agencyId}:${zone.neighborhood}`,
      kind: "opportunity",
      severity: "low",
      title: `Hay interés en ${zone.neighborhood} y no tenés propiedades ahí`,
      explanation: `En ${zone.neighborhood} se registraron ${zone.views} visitas en 30 días entre ${zone.supply} ${zone.supply === 1 ? "propiedad publicada" : "propiedades publicadas"}.`,
      action: "Si trabajás esa zona, sumar propiedades te posiciona frente a ese interés.",
      href: "/dashboard/propiedades/nueva",
      evidence: [
        { label: "Visitas (30 días)", value: String(zone.views) },
        { label: "Propiedades publicadas", value: String(zone.supply) },
      ],
    });
  }

  return out;
}

export type ZoneDemand = { neighborhood: string; views: number; supply: number };

/** Zonas donde la plataforma registra más visitas por propiedad publicada (cacheado 10 min). */
export function getDemandByNeighborhood(): Promise<ZoneDemand[]> {
  return memo("demand-by-neighborhood", 10 * 60_000, async () => {
    const [metrics, props] = await Promise.all([
      getPropertyMetrics({}),
      Property.find({ status: "published", "address.neighborhood": { $nin: [null, ""] } })
        .select("address.neighborhood")
        .limit(5000)
        .lean(),
    ]);

    const zones = new Map<string, { views: number; supply: number }>();
    for (const p of props) {
      const name = p.address?.neighborhood;
      if (!name) continue;
      const z = zones.get(name) ?? { views: 0, supply: 0 };
      z.supply += 1;
      z.views += metrics.get(String(p._id))?.d30.views ?? 0;
      zones.set(name, z);
    }

    return [...zones.entries()]
      .map(([neighborhood, z]) => ({ neighborhood, ...z }))
      .filter((z) => z.views >= 50)
      .sort((a, b) => b.views / b.supply - a.views / a.supply)
      .slice(0, 10);
  });
}
