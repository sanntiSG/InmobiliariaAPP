import type { Bench } from "./benchmarks";
import { avgDwellSec, consultas, deltaPct, type LeadFunnel, type PropertyMetrics } from "./metrics";

export type DiagnosticKind = "attention" | "opportunity" | "positive";
export type DiagnosticSeverity = "high" | "medium" | "low";

/** Un hallazgo explicado en lenguaje simple, con la evidencia numérica y una acción posible. */
export type Diagnostic = {
  id: string;
  propertyId?: string;
  propertyTitle?: string;
  kind: DiagnosticKind;
  severity: DiagnosticSeverity;
  title: string;
  explanation: string;
  action?: string;
  href?: string;
  evidence: { label: string; value: string }[];
};

export type DiagnosticProperty = {
  id: string;
  title: string;
  type: string;
  operation: string;
  publishedAt: Date | null;
  /** Última vez que cambió el precio (o `null` si nunca). */
  priceChangedAt: Date | null;
  imageCount: number;
  descriptionLength: number;
  videoCount: number;
  hasTour: boolean;
  hasArea: boolean;
  hasBedrooms: boolean;
};

export type DiagnosticInput = {
  property: DiagnosticProperty;
  metrics: PropertyMetrics | null;
  bench: Bench;
  leads: LeadFunnel | null;
  now?: number;
};

/** Umbrales — un solo lugar para ajustarlos. */
export const THRESHOLDS = {
  /** Visitas en 30 días para hablar de "muchas visitas" y poder medir tasas. */
  minViewsForRates: 30,
  highViews: 100,
  /** Una tasa de consulta menor a esta fracción del promedio de comparables es "baja". */
  lowInquiryFactor: 0.5,
  /** Piso absoluto de la tasa baja (si el promedio es muy chico, igual hace falta algo). */
  minInquiryRate: 0.01,
  defaultInquiryRate: 0.03,
  /** Crecimiento semanal de visitas para considerarlo "aumento de interés". */
  risingGrowthPct: 30,
  risingMinViews: 15,
  risingMinPrevViews: 5,
  manyConsultasWeek: 5,
  leadsForConversion: 5,
  lowVisitConversion: 0.15,
  newListingGraceDays: 7,
  lowViewsFloor: 10,
  lowViewsFactor: 0.4,
  /** Visitas típicas (mediana de 30 días) mínimas en la plataforma para poder decir que una propiedad tiene "pocas". */
  minPlatformViews: 5,
  dwellDropFactor: 0.7,
  dwellMinSamples: 5,
  stalePriceDays: 60,
  staleInterestFactor: 0.7,
  minImages: 5,
  minDescription: 200,
  savesWithoutConsultas: 5,
} as const;

const DAY_MS = 86_400_000;
const pct = (n: number) => `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const editHref = (id: string) => `/dashboard/propiedades/${id}/editar`;
const SEVERITY_WEIGHT: Record<DiagnosticSeverity, number> = { high: 3, medium: 2, low: 1 };
const KIND_WEIGHT: Record<DiagnosticKind, number> = { attention: 3, opportunity: 2, positive: 1 };

/** Más importante primero: severidad, y a igual severidad lo que requiere atención antes que lo positivo. */
export function sortDiagnostics(list: Diagnostic[]): Diagnostic[] {
  return [...list].sort(
    (a, b) =>
      SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] || KIND_WEIGHT[b.kind] - KIND_WEIGHT[a.kind]
  );
}

/**
 * Diagnóstico de UNA propiedad a partir de sus propios números, comparados
 * con propiedades similares. Es una función pura (sin base de datos): reglas
 * explícitas y umbrales mínimos de datos para no sacar conclusiones con poca
 * información. Cada hallazgo explica qué pasa y, cuando se puede, qué hacer.
 */
export function diagnoseProperty({ property: p, metrics, bench, leads, now = Date.now() }: DiagnosticInput): Diagnostic[] {
  const T = THRESHOLDS;
  const out: Diagnostic[] = [];
  const base = { propertyId: p.id, propertyTitle: p.title };
  const push = (d: Omit<Diagnostic, "propertyId" | "propertyTitle" | "id"> & { rule: string }) => {
    const { rule, ...rest } = d;
    out.push({ ...base, id: `${rule}:${p.id}`, ...rest });
  };

  const d30 = metrics?.d30;
  const w7 = metrics?.w7;
  const p7 = metrics?.p7;
  const views30 = d30?.views ?? 0;
  const consultas30 = d30 ? consultas(d30) : 0;
  const ageDays = p.publishedAt ? (now - p.publishedAt.getTime()) / DAY_MS : Infinity;

  // 1. Muchas visitas, pocas consultas.
  if (d30 && views30 >= T.minViewsForRates) {
    const rate = consultas30 / views30;
    const reference = bench.inquiryRate ?? T.defaultInquiryRate;
    const threshold = Math.max(T.minInquiryRate, reference * T.lowInquiryFactor);
    if (rate < threshold) {
      push({
        rule: "high-views-low-inquiries",
        kind: "attention",
        severity: views30 >= T.highViews ? "high" : "medium",
        title: "Muchas visitas, pocas consultas",
        explanation: `La propiedad recibe muchas visitas (${views30} en 30 días), pero pocas personas realizan una consulta (${pct(rate)}${
          bench.inquiryRate != null ? `; en propiedades similares es ${pct(bench.inquiryRate)}` : ""
        }).`,
        action: "Revisá el precio, mejorá la descripción o sumá un recorrido 360° para convertir el interés en consultas.",
        href: editHref(p.id),
        evidence: [
          { label: "Visitas (30 días)", value: String(views30) },
          { label: "Consultas (30 días)", value: String(consultas30) },
          { label: "Tasa de consulta", value: pct(rate) },
        ],
      });
    }
  }

  // 2. Interés en alza esta semana.
  if (w7 && p7 && w7.views >= T.risingMinViews && p7.views >= T.risingMinPrevViews) {
    const growth = deltaPct(w7.views, p7.views);
    if (growth != null && growth >= T.risingGrowthPct) {
      push({
        rule: "interest-rising",
        kind: "positive",
        severity: "medium",
        title: "Aumentó su interés esta semana",
        explanation: `Las visitas subieron ${growth}% respecto de la semana pasada (${w7.views} contra ${p7.views}).`,
        action: "Es buen momento para destacarla: compartila y revisá que la información y el precio estén al día.",
        href: editHref(p.id),
        evidence: [
          { label: "Visitas esta semana", value: String(w7.views) },
          { label: "Semana anterior", value: String(p7.views) },
        ],
      });
    }
  }

  // 3. Muchas consultas esta semana.
  if (w7 && consultas(w7) >= T.manyConsultasWeek) {
    push({
      rule: "many-inquiries",
      kind: "positive",
      severity: "high",
      title: "Está recibiendo muchas consultas",
      explanation: `Tuvo ${consultas(w7)} consultas esta semana.`,
      action: "Respondé rápido: contactar en las primeras horas aumenta las chances de coordinar una visita.",
      href: "/dashboard/clientes",
      evidence: [{ label: "Consultas (7 días)", value: String(consultas(w7)) }],
    });
  }

  // 4. Muchas consultas, pocas visitas realizadas.
  if (leads && leads.total >= T.leadsForConversion && leads.visitDone / leads.total < T.lowVisitConversion) {
    push({
      rule: "inquiries-low-conversion",
      kind: "attention",
      severity: "medium",
      title: "Muchas consultas, pocas visitas realizadas",
      explanation: `Recibió ${leads.total} consultas, pero solo ${leads.visitDone} llegaron a una visita (${pct(leads.visitDone / leads.total)}).`,
      action: "Revisá el seguimiento: al responder, ofrecé horarios de visita concretos.",
      href: "/dashboard/clientes",
      evidence: [
        { label: "Consultas", value: String(leads.total) },
        { label: "Visitas realizadas", value: String(leads.visitDone) },
      ],
    });
  }

  // 5. Pocas visitas (con un margen para publicaciones recién creadas). Sólo si la
  // plataforma ya tiene tráfico medido: sin referencia, "pocas" no significa nada.
  if (p.publishedAt && ageDays >= T.newListingGraceDays && (bench.medianViews30 ?? 0) >= T.minPlatformViews) {
    const lowThreshold = Math.max(T.lowViewsFloor, bench.medianViews30! * T.lowViewsFactor);
    if (views30 < lowThreshold) {
      push({
        rule: "low-views",
        kind: "attention",
        severity: "medium",
        title: "Pocas visitas",
        explanation: `Tuvo ${views30} ${plural(views30, "visita", "visitas")} en 30 días${
          bench.medianViews30 != null ? `; una propiedad similar suele tener ${Math.round(bench.medianViews30)}` : ""
        }.`,
        action: "Sumá más fotos, un recorrido 360° o un video, y revisá si el precio está en línea con la zona.",
        href: editHref(p.id),
        evidence: [{ label: "Visitas (30 días)", value: String(views30) }],
      });
    }
  }

  // 6. Cae el tiempo de permanencia.
  if (w7 && p7 && w7.dwellSamples >= T.dwellMinSamples && p7.dwellSamples >= T.dwellMinSamples) {
    const now7 = avgDwellSec(w7)!;
    const before7 = avgDwellSec(p7)!;
    if (before7 > 0 && now7 < before7 * T.dwellDropFactor) {
      push({
        rule: "dwell-drop",
        kind: "attention",
        severity: "low",
        title: "Las personas se quedan menos tiempo",
        explanation: `El tiempo promedio en la ficha bajó de ${before7} s a ${now7} s respecto de la semana pasada.`,
        action: "Revisá que las fotos principales y la descripción sigan siendo atractivas.",
        href: editHref(p.id),
        evidence: [
          { label: "Esta semana", value: `${now7} s` },
          { label: "Semana anterior", value: `${before7} s` },
        ],
      });
    }
  }

  // 7. Sin recorrido 360°.
  if (!p.hasTour) {
    push({
      rule: "no-tour",
      kind: "opportunity",
      severity: views30 >= T.minViewsForRates ? "medium" : "low",
      title: "No tiene recorrido 360°",
      explanation:
        "Un recorrido 360° permite conocer la propiedad sin ir hasta ahí y ayuda a que consulten solo los realmente interesados.",
      action: "Subí fotos 360° y armá el recorrido desde la edición de la propiedad.",
      href: editHref(p.id),
      evidence: [{ label: "Recorrido 360°", value: "No" }],
    });
  }

  // 8. Publicación incompleta.
  const missing: string[] = [];
  if (p.imageCount < T.minImages) missing.push(`fotos (tiene ${p.imageCount}, conviene al menos ${T.minImages})`);
  if (p.descriptionLength < T.minDescription) missing.push("una descripción más completa");
  if (!p.hasArea) missing.push("la superficie");
  if (!p.hasBedrooms) missing.push("la cantidad de dormitorios");
  if (missing.length > 0) {
    push({
      rule: "incomplete-listing",
      kind: "attention",
      severity: p.imageCount < 3 ? "medium" : "low",
      title: "Publicación incompleta",
      explanation: `A esta publicación le falta: ${missing.join(", ")}.`,
      action: "Completá estos datos desde la edición de la propiedad: las fichas completas generan más confianza.",
      href: editHref(p.id),
      evidence: [{ label: "Datos faltantes", value: String(missing.length) }],
    });
  }

  // 9. Sin videos.
  if (p.videoCount === 0) {
    push({
      rule: "no-videos",
      kind: "opportunity",
      severity: "low",
      title: "No tiene videos",
      explanation: "Un video corto mostrando la propiedad ayuda a retener la atención de quien llega a la ficha.",
      action: "Sumá un recorrido en video desde la edición de la propiedad.",
      href: editHref(p.id),
      evidence: [{ label: "Videos", value: "0" }],
    });
  }

  // 10. Precio sin cambios y el interés baja.
  if (w7 && p7 && p.publishedAt) {
    const sinceChange = (now - (p.priceChangedAt ?? p.publishedAt).getTime()) / DAY_MS;
    if (sinceChange >= T.stalePriceDays && p7.views >= T.risingMinPrevViews && w7.views < p7.views * T.staleInterestFactor) {
      push({
        rule: "stale-price",
        kind: "attention",
        severity: "medium",
        title: "Precio sin cambios y menos interés",
        explanation: `El precio no cambia hace ${Math.round(sinceChange)} días y las visitas bajaron de ${p7.views} a ${w7.views} en la última semana.`,
        action: "Evaluá un ajuste de precio: además, avisa automáticamente a quienes la guardaron.",
        href: editHref(p.id),
        evidence: [
          { label: "Días sin cambiar el precio", value: String(Math.round(sinceChange)) },
          { label: "Visitas (esta semana / anterior)", value: `${w7.views} / ${p7.views}` },
        ],
      });
    }
  }

  // 11. Guardada por varios, pero nadie consulta.
  if (d30 && d30.saves >= T.savesWithoutConsultas && consultas30 === 0) {
    push({
      rule: "saves-no-inquiries",
      kind: "opportunity",
      severity: "medium",
      title: "Genera interés, pero nadie consulta",
      explanation: `${d30.saves} personas la guardaron en los últimos 30 días y ninguna consultó.`,
      action: "Una baja de precio o una mejora de la publicación se notifica a quienes la guardaron.",
      href: editHref(p.id),
      evidence: [
        { label: "Guardados (30 días)", value: String(d30.saves) },
        { label: "Consultas", value: "0" },
      ],
    });
  }

  // 12. Clientes sin seguimiento.
  if (leads && leads.stale > 0) {
    push({
      rule: "leads-unattended",
      kind: "attention",
      severity: "high",
      title: "Consultas sin responder",
      explanation: `${leads.stale} ${plural(leads.stale, "persona lleva", "personas llevan")} demasiado tiempo sin seguimiento.`,
      action: "Contactalas hoy: una consulta sin respuesta se enfría rápido.",
      href: "/dashboard/clientes",
      evidence: [{ label: "Sin seguimiento", value: String(leads.stale) }],
    });
  }

  return sortDiagnostics(out);
}

/** Puntaje de interés para rankear propiedades: pondera acciones de más intención más alto. */
export function interestScore(m: PropertyMetrics["d30"]): number {
  return m.views + 3 * m.saves + 3 * m.likes + 5 * consultas(m) + 2 * m.shares + 2 * m.tourOpens + 2 * m.comments;
}

export type InteractionKind = "visitas" | "guardados" | "me gusta" | "consultas" | "compartidos" | "recorridos 360°";

/** Qué tipo de interacción domina en una propiedad (para "está recibiendo sobre todo X"). */
export function dominantInteraction(m: PropertyMetrics["d30"]): InteractionKind | null {
  const parts: [InteractionKind, number][] = [
    ["visitas", m.views],
    ["guardados", m.saves * 3],
    ["me gusta", m.likes * 3],
    ["consultas", consultas(m) * 5],
    ["compartidos", m.shares * 2],
    ["recorridos 360°", m.tourOpens * 2],
  ];
  const best = parts.sort((a, b) => b[1] - a[1])[0]!;
  return best[1] > 0 ? best[0] : null;
}
