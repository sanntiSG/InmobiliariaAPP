/**
 * Handlers de rendimiento: resumen, métricas puntuales, mejores y peores,
 * visitas sin consultas, investigación de una propiedad, cambios contra el
 * período anterior y qué revisar primero. Todo sale de los mismos números del
 * panel (`getIntelligence`, rollup diario); acá sólo se ordenan y se explican.
 */
import { benchFor } from "@/lib/intelligence/benchmarks";
import { THRESHOLDS, sortDiagnostics, type Diagnostic } from "@/lib/intelligence/diagnostics";
import { avgDwellSec, consultas, getDailySeries, ratio, type Totals } from "@/lib/intelligence/metrics";
import { dedupeSuggestions, sug } from "../../compose/suggest";
import { change, clip, count, daysAgo, list, median, n0, pct, pick, plural, quote, signedPct } from "../../compose/format";
import { describeChange, describeEntry } from "../../compose/activity-text";
import { periodRange, previousOf } from "../../data/periods";
import type { PropertyRow } from "../../data/portfolio";
import type { AdvisorBlock, MetricId, PeriodId, SuggestionQuery } from "../../types";
import { IMPACT_FIELDS, recentChanges } from "../correlate";
import type { AgencyHandler, HandlerResult } from "../types";
import {
  DEFAULT_LIST,
  MAX_LIST,
  METRIC_LABELS,
  MIN_VIEWS,
  THIN_DATA_TEXT,
  editHref,
  filterRows,
  filterText,
  hasThinData,
  metricValue,
  propRef,
  statsHref,
  sumTotals,
  targetRows,
  totalsByProperty,
  zoneOf,
} from "./shared";

const tile = (label: string, cur: number, prev: number, hint?: string) => {
  const d = change(cur, prev);
  return {
    label,
    value: n0(cur),
    delta: d == null ? null : Math.round(d),
    hint,
    tone: d == null ? ("neutral" as const) : d >= 10 ? ("good" as const) : d <= -10 ? ("bad" as const) : ("neutral" as const),
  };
};

const periodWord = (p: PeriodId) => periodRange(p).short;
const FLAGGED = ["high-views-low-inquiries", "saves-no-inquiries"];
const isFlagged = (d: Diagnostic) => FLAGGED.some((id) => d.id.startsWith(id));
/** Visitas mínimas en el período para que un ranking de rendimiento tenga sentido. */
const MIN_RANK_VIEWS = 20;
const limitOf = (n: number | undefined) => Math.min(MAX_LIST, Math.max(1, n ?? DEFAULT_LIST));

// ─── Resumen general ─────────────────────────────────────────────────────────

export const overview: AgencyHandler = async (env) => {
  const { portfolio: p, now } = env;
  const period: PeriodId = env.slots.period && ["week", "month", "today"].includes(env.slots.period) ? env.slots.period : "week";
  const prevPeriod = previousOf(period);

  if (p.rows.length === 0) {
    return {
      lead: pick(
        [
          "Todavía no hay propiedades publicadas, así que no tengo nada que medir. Apenas publiques la primera, empiezo a seguirla.",
          "Aún no tenés propiedades publicadas: no hay visitas ni consultas para analizar todavía.",
        ],
        env.seed
      ),
      blocks: [],
      followUps: [sug("common.help", "¿Qué podés hacer por mí?")],
      actions: [{ label: "Publicar una propiedad", href: "/dashboard/propiedades/nueva", kind: "primary" }],
    };
  }

  const [curMap, prevMap, series] = await Promise.all([
    totalsByProperty(env, period),
    totalsByProperty(env, prevPeriod),
    getDailySeries({ agencyId: env.scope.agencyId }, period === "month" ? 30 : 14, now),
  ]);
  const cur = sumTotals(curMap);
  const prev = sumTotals(prevMap);
  const viewsDelta = change(cur.views, prev.views);

  const flagged = p.rows.filter((r) => r.diagnostics.some((d) => d.kind === "attention" && d.severity !== "low"));
  const best = [...p.rows].sort((a, b) => b.score - a.score).find((r) => r.score > 0);

  const parts = [
    `${n0(cur.views)} ${plural(cur.views, "visita", "visitas")}${viewsDelta != null && prev.views > 0 ? ` (${signedPct(viewsDelta, 0)} contra ${periodWord(prevPeriod)})` : ""}`,
    `${n0(consultas(cur))} ${plural(consultas(cur), "consulta", "consultas")}`,
    `${n0(cur.saves)} ${plural(cur.saves, "favorito", "favoritos")}`,
  ];
  let lead = `${cap(periodWord(period))} sumás ${list(parts)}.`;
  if (period === "today") lead = `Hoy llevás ${list(parts)}.`;
  if (best && cur.views > 0) lead += ` La que más interés genera es ${quote(best.title)}.`;
  if (flagged.length > 0) {
    lead += ` Hay ${count(flagged.length, "propiedad que conviene revisar", "propiedades que conviene revisar")}.`;
  } else if (cur.views > 0) {
    lead += " No veo nada urgente para atender.";
  }
  if (hasThinData(env)) lead += ` ${THIN_DATA_TEXT}`;

  const funnels = p.intel.funnels;
  const tiles = [
    tile("Visitas", cur.views, prev.views),
    tile("Consultas", consultas(cur), consultas(prev)),
    tile("Favoritos", cur.saves, prev.saves),
    tile("Visitas al 360°", cur.tourOpens, prev.tourOpens),
  ];
  const blocks: AdvisorBlock[] = [{ type: "metrics", items: tiles }];
  if (series.some((s) => s.views + s.saves + s.inquiries > 0)) {
    blocks.push({
      type: "trend",
      label: period === "month" ? "Visitas de los últimos 30 días" : "Visitas de las últimas 2 semanas",
      points: series.map((s) => ({ day: s.day, views: s.views, saves: s.saves, likes: s.likes, inquiries: s.inquiries, contacts: s.contacts })),
    });
  }
  if (funnels.visitsToConsultas != null && cur.views >= MIN_VIEWS) {
    const ref = p.intel.benchmark.inquiryRate;
    blocks.push({
      type: "text",
      text: `De cada 100 visitas, ${n0((funnels.visitsToConsultas ?? 0) * 100)} terminan en consulta${ref != null ? `; en propiedades similares de la plataforma son ${n0(ref * 100)}` : ""}.`,
    });
  }

  const attention = sortDiagnostics(p.intel.opportunities.filter((d) => d.kind === "attention")).slice(0, 2);
  if (attention.length > 0) blocks.push({ type: "diagnostics", items: attention });

  const flaggedViews = p.rows.filter((r) => r.diagnostics.some(isFlagged));
  const followUps: SuggestionQuery[] = [];
  if (flaggedViews.length > 0)
    followUps.push(sug("agency.views_no_inquiries", "¿Cuáles tienen visitas pero pocas consultas?", { hint: `${flaggedViews.length} ${plural(flaggedViews.length, "propiedad", "propiedades")}`, tone: "warn" }));
  followUps.push(sug("agency.changes_vs_previous", `¿Qué cambió respecto de ${periodWord(prevPeriod)}?`, viewsDelta != null && prev.views > 0 ? { hint: `${signedPct(viewsDelta, 0)} visitas`, tone: viewsDelta >= 0 ? "good" : "warn" } : {}));
  followUps.push(sug("agency.review_first", "¿Qué debería revisar primero?"));
  followUps.push(sug("agency.actions", "¿Qué me recomendás hacer?"));

  return {
    lead,
    blocks,
    followUps: dedupeSuggestions(followUps),
    resultIds: flagged.slice(0, 5).map((r) => r.id),
    mood: viewsDelta != null && Math.abs(viewsDelta) >= 40 && cur.views >= 20 ? "surprised" : "neutral",
  };
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

// ─── Una métrica puntual ─────────────────────────────────────────────────────

export const metric: AgencyHandler = async (env) => {
  const { portfolio: p, now } = env;
  const period: PeriodId = env.slots.period ?? "week";
  const prevPeriod = previousOf(period);
  const m: MetricId = env.slots.metric && env.slots.metric !== "conversion" ? env.slots.metric : "views";
  const label = METRIC_LABELS[m];

  const rows = filterRows(p.rows, env.slots);
  if (rows.length === 0) {
    return { lead: noRowsText(env.slots), blocks: [], followUps: [sug("agency.overview", "Dame un resumen general")] };
  }

  const [curMap, prevMap, series] = await Promise.all([
    totalsByProperty(env, period),
    totalsByProperty(env, prevPeriod),
    getDailySeries({ agencyId: env.scope.agencyId }, 14, now),
  ]);
  const ids = new Set(rows.map((r) => r.id));
  const sumOf = (map: Map<string, Totals>) => sumTotals(new Map([...map].filter(([id]) => ids.has(id))));
  const cur = sumOf(curMap);
  const prev = sumOf(prevMap);
  const value = metricValue(cur, m);
  const before = metricValue(prev, m);
  const d = change(value, before);

  const unit = m === "dwell" ? "segundos de permanencia promedio" : plural(value, label.one, label.many);
  let lead = `${cap(periodWord(period))} tuviste ${n0(value)} ${unit}`;
  const scopeText = filterText(env.slots);
  if (scopeText) lead += ` en ${scopeText}`;
  if (d != null && before > 0 && period !== "yesterday") lead += `, ${signedPct(d, 0)} respecto de ${periodWord(prevPeriod)} (${n0(before)}).`;
  else lead += ".";
  if (value === 0 && before === 0) lead = `No registré ${label.many} ${periodWord(period)}${scopeText ? ` en ${scopeText}` : ""}.`;

  const top = rows
    .map((r) => ({ r, v: metricValue(curMap.get(r.id) ?? ({} as Totals), m) }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 5);

  const blocks: AdvisorBlock[] = [{ type: "metrics", items: [tile(cap(label.short), value, before)] }];
  if (top.length > 0) {
    blocks.push({
      type: "bars",
      items: top.map(({ r, v }) => ({ label: clip(r.title, 40), value: v, valueText: n0(v), sublabel: zoneOf(r), href: statsHref(r) })),
    });
  }
  if (series.some((s) => s.views > 0)) {
    blocks.push({
      type: "trend",
      label: "Últimas 2 semanas",
      points: series.map((s) => ({ day: s.day, views: s.views, saves: s.saves, likes: s.likes, inquiries: s.inquiries, contacts: s.contacts })),
    });
  }

  return {
    lead,
    blocks,
    followUps: dedupeSuggestions([
      sug("agency.changes_vs_previous", "¿Qué cambió respecto del período anterior?"),
      sug("agency.best", "¿Cuáles son las que mejor funcionan?"),
      sug("agency.worst", "¿Y las que peor funcionan?"),
    ]),
    resultIds: top.map((t) => t.r.id),
  };
};

function noRowsText(slots: HandlerSlots): string {
  const f = filterText(slots);
  return f ? `No encuentro propiedades publicadas de ${f}. Revisá el nombre de la zona o probá sin ese filtro.` : "No encuentro propiedades publicadas para analizar.";
}
type HandlerSlots = Parameters<typeof filterText>[0];

// ─── Mejores y peores ────────────────────────────────────────────────────────

async function ranking(env: Parameters<AgencyHandler>[0], direction: "worst" | "best"): Promise<HandlerResult> {
  const { portfolio: p } = env;
  const period: PeriodId = env.slots.period && !["prev_week", "prev_month"].includes(env.slots.period) ? env.slots.period : "week";
  const m: MetricId = env.slots.metric && env.slots.metric !== "conversion" ? env.slots.metric : "interest";
  const label = METRIC_LABELS[m];
  const n = limitOf(env.slots.count);

  let rows = filterRows(p.rows, env.slots);
  if (rows.length === 0) return { lead: noRowsText(env.slots), blocks: [], followUps: [sug("agency.overview", "Dame un resumen general")] };

  const totals = await totalsByProperty(env, period);
  const totalViews = [...totals.values()].reduce((a, t) => a + t.views, 0);

  // Con casi ningún tráfico, ordenar sería ordenar ruido: se dice y se ofrece lo que sí se puede mirar.
  if (totalViews < MIN_RANK_VIEWS) {
    const toImprove = rows.filter((r) => r.diagnostics.some((d) => d.kind === "attention")).length;
    return {
      lead: `${cap(periodWord(period))} casi no hay visitas medidas (${n0(totalViews)} en total${filterText(env.slots) ? ` entre tus ${filterText(env.slots)}` : ""}), así que un ranking de "${direction === "worst" ? "peor" : "mejor"}" sería puro ruido.${toImprove > 0 ? ` Lo que sí puedo decirte es que ${count(toImprove, "publicación tiene", "publicaciones tienen")} cosas por mejorar.` : ""} Cuando haya más tráfico lo calculo con firmeza.`,
      blocks: [{ type: "caveat", text: THIN_DATA_TEXT }],
      followUps: dedupeSuggestions([
        sug("agency.review_first", "¿Qué debería revisar primero?"),
        sug("agency.incomplete", "¿Hay publicaciones incompletas?"),
        sug("agency.actions", "¿Qué me recomendás hacer?"),
      ]),
    };
  }

  // Las muy nuevas todavía no tuvieron tiempo de rendir: se dejan afuera del "peor" salvo que no quede nada.
  if (direction === "worst") {
    const graceMs = THRESHOLDS.newListingGraceDays * 86_400_000;
    const established = rows.filter((r) => !r.publishedAt || env.now.getTime() - r.publishedAt.getTime() >= graceMs);
    if (established.length > 0) rows = established;
  }

  const scored = rows
    .map((r) => ({ r, t: totals.get(r.id)!, v: metricValue(totals.get(r.id)!, m) }))
    .sort((a, b) => (direction === "worst" ? a.v - b.v || a.t.views - b.t.views : b.v - a.v || b.t.views - a.t.views));
  const shown = scored.slice(0, n);

  const prevTotals = period === "week" || period === "month" ? await totalsByProperty(env, previousOf(period)) : null;

  const refs = shown.map(({ r, t }) => {
    const chips = [`${n0(t.views)} ${plural(t.views, "visita", "visitas")}`, `${n0(consultas(t))} ${plural(consultas(t), "consulta", "consultas")}`];
    const prev = prevTotals?.get(r.id);
    if (prev && prev.views >= 5) {
      const d = change(t.views, prev.views);
      if (d != null && Math.abs(d) >= 20) chips.push(`${signedPct(d, 0)} visitas`);
    }
    return propRef(r, env, { chips });
  });

  const names = shown.slice(0, 3).map((s) => quote(s.r.title));
  const word = periodWord(period);
  const metricName = m === "interest" ? "interés" : label.short;
  let lead: string;
  if (direction === "worst") {
    lead = pick(
      [
        `${cap(word)}, las que menos ${metricName} generan son ${list(names)}.`,
        `Las que peor andan ${word} (por ${metricName}) son ${list(names)}.`,
      ],
      env.seed
    );
  } else {
    lead = pick(
      [
        `${cap(word)}, las que más ${metricName} generan son ${list(names)}.`,
        `Lo que mejor funciona ${word} (por ${metricName}): ${list(names)}.`,
      ],
      env.seed
    );
  }
  if (shown.length === 1) lead = lead.replace("son ", "es ");
  const scopeText = filterText(env.slots);
  if (scopeText) lead = `${lead.replace(/.$/, "")} (entre tus ${scopeText}).`;

  const blocks: AdvisorBlock[] = [{ type: "properties", items: refs }];

  const first = shown[0]?.r;
  const followUps: SuggestionQuery[] =
    direction === "worst"
      ? [
          first ? sug("agency.investigate", "Investigar por qué", { slots: { propertyIds: shown.map((s) => s.r.id) }, tone: "warn" }) : null,
          sug("agency.review_first", "¿Qué reviso primero?"),
          sug("agency.simulate_price", "¿Qué pasaría si bajo el precio?", { slots: { propertyIds: shown.map((s) => s.r.id), percent: -5 } }),
          sug("agency.actions", "¿Qué me recomendás hacer?"),
        ].filter((s): s is SuggestionQuery => !!s)
      : [
          sug("agency.traits", "¿Qué tienen en común las que mejor funcionan?"),
          sug("agency.promote", "¿Cuáles conviene promocionar?"),
          sug("agency.type_interest", "¿Qué tipo de propiedad rinde más?"),
        ];

  return { lead, blocks, followUps: dedupeSuggestions(followUps), resultIds: shown.map((s) => s.r.id), focusPropertyId: first?.id };
}

export const worst: AgencyHandler = (env) => ranking(env, "worst");
export const best: AgencyHandler = (env) => ranking(env, "best");

// ─── Muchas visitas, pocas consultas ─────────────────────────────────────────

export const viewsNoInquiries: AgencyHandler = (env) => {
  const { portfolio: p } = env;
  const pool = filterRows(p.rows, env.slots);
  const flagged = pool
    .filter((r) => r.diagnostics.some(isFlagged))
    .sort((a, b) => b.d30.views - a.d30.views);

  if (flagged.length === 0) {
    // Se muestra el caso más cercano para no responder en vacío.
    const candidates = pool
      .filter((r) => r.d30.views >= MIN_VIEWS)
      .map((r) => ({ r, rate: consultas(r.d30) / r.d30.views }))
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 3);
    if (candidates.length === 0) {
      return {
        lead: `Ninguna propiedad llegó todavía a ${MIN_VIEWS} visitas en 30 días, que es lo mínimo que necesito para medir cuántas visitas se convierten en consultas sin equivocarme.`,
        blocks: [],
        followUps: dedupeSuggestions([sug("agency.best", "¿Cuáles tienen más visitas?"), sug("agency.actions", "¿Qué hago para conseguir más visitas?")]),
      };
    }
    return {
      lead: "Ninguna propiedad tiene hoy un desbalance claro entre visitas y consultas. Estas son las que menos convierten, por si querés mirarlas:",
      blocks: [
        {
          type: "properties",
          items: candidates.map(({ r, rate }) => propRef(r, env, { chips: [`${n0(r.d30.views)} visitas`, `${n0(consultas(r.d30))} consultas`, `tasa ${pct(rate, { fromRatio: true })}`] })),
        },
      ],
      followUps: dedupeSuggestions([sug("agency.actions", "¿Qué me recomendás hacer?")]),
      resultIds: candidates.map((c) => c.r.id),
    };
  }

  const shown = flagged.slice(0, limitOf(env.slots.count));
  const refs = shown.map((r) => {
    const b = benchFor(p.bench, r.type, r.operation);
    const rate = ratio(consultas(r.d30), r.d30.views);
    return propRef(r, env, {
      chips: [`${n0(r.d30.views)} visitas`, `${n0(consultas(r.d30))} consultas`, `${n0(r.d30.saves)} favoritos`],
      note:
        rate != null && b.inquiryRate != null
          ? `Tasa de consulta ${pct(rate, { fromRatio: true })} (en similares: ${pct(b.inquiryRate, { fromRatio: true })}).`
          : undefined,
      tone: "bad",
      auto: false,
    });
  });

  const names = list(shown.slice(0, 3).map((r) => quote(r.title)));
  const lead = `${shown.length === 1 ? `${names} recibe` : `${n0(flagged.length)} ${plural(flagged.length, "propiedad recibe", "propiedades reciben")} mucho interés`} pero se convierte${shown.length === 1 ? "" : "n"} poco en consultas${shown.length > 1 ? `: ${names}${flagged.length > 3 ? " y otras" : ""}` : ""}. Eso suele indicar que la gente mira pero algo la frena: el precio, la descripción o que falta algo para confiar.`;

  return {
    lead,
    blocks: [{ type: "properties", items: refs }],
    followUps: dedupeSuggestions([
      sug("agency.investigate", "Investigar por qué", { slots: { propertyIds: shown.map((r) => r.id) }, tone: "warn" }),
      sug("agency.simulate_price", "¿Qué pasaría si bajo el precio?", { slots: { propertyIds: shown.map((r) => r.id), percent: -5 } }),
      sug("agency.photos", "¿Necesitan mejores fotos?"),
    ]),
    actions: shown[0] ? [{ label: "Editar la primera", href: editHref(shown[0]), kind: "secondary" }] : [],
    resultIds: shown.map((r) => r.id),
    focusPropertyId: shown[0]?.id,
    mood: shown.some((r) => r.d30.views >= 100) ? "surprised" : "neutral",
  };
};

// ─── Investigar por qué ──────────────────────────────────────────────────────

type Finding = { factor: string; mine: string; ref: string; severity: number; text: string };

function investigateRow(r: PropertyRow, env: Parameters<AgencyHandler>[0]): { findings: Finding[]; rows: Finding[]; refLabel: string; refCount: number } {
  const { portfolio: p } = env;
  const others = p.rows.filter((o) => o.id !== r.id);
  const sameKind = others.filter((o) => o.type === r.type && o.operation === r.operation);
  const withData = (list: PropertyRow[]) => list.filter((o) => o.d30.views >= MIN_VIEWS);
  const rateOf = (o: PropertyRow) => consultas(o.d30) / o.d30.views;
  const bench = benchFor(p.bench, r.type, r.operation);
  const threshold = bench.inquiryRate ?? THRESHOLDS.defaultInquiryRate;

  // Referencia: las que SÍ convierten (del mismo tipo si alcanzan, si no todas); si no hay, las parecidas.
  let refs = withData(sameKind).filter((o) => rateOf(o) >= threshold);
  let refLabel = "las que convierten mejor";
  if (refs.length < 2) refs = withData(others).filter((o) => rateOf(o) >= threshold);
  if (refs.length < 2) {
    refs = sameKind.length >= 2 ? sameKind : others;
    refLabel = "tus otras propiedades similares";
  }

  const findings: Finding[] = [];
  const rows: Finding[] = [];
  const add = (f: Finding, flag: boolean) => {
    rows.push(f);
    if (flag) findings.push(f);
  };

  if (refs.length === 0) return { findings, rows, refLabel, refCount: 0 };

  // Precio por m² (sólo contra propiedades de la misma moneda y operación).
  const comparable = refs.filter((o) => o.pricePerM2 && o.currency === r.currency && o.operation === r.operation);
  const medPpm = median(comparable.map((o) => o.pricePerM2!));
  if (r.pricePerM2 && medPpm && comparable.length >= 2) {
    const diff = ((r.pricePerM2 - medPpm) / medPpm) * 100;
    add(
      {
        factor: "Precio por m²",
        mine: `${n0(r.pricePerM2)} ${r.currency}`,
        ref: `${n0(medPpm)} ${r.currency}`,
        severity: Math.abs(diff) / 10,
        text: `su precio por m² es ${pct(Math.abs(diff), { digits: 0 })} ${diff > 0 ? "más alto" : "más bajo"} que el de ${refLabel}`,
      },
      diff >= 15
    );
  }

  const medImages = median(refs.map((o) => o.images));
  if (medImages != null) {
    add(
      {
        factor: "Fotos",
        mine: String(r.images),
        ref: n0(medImages),
        severity: Math.max(0, medImages - r.images),
        text: `tiene ${r.images} ${plural(r.images, "foto", "fotos")} y ${refLabel} tienen ${n0(medImages)}`,
      },
      r.images < THRESHOLDS.minImages || r.images <= medImages - 3
    );
  }

  const medDesc = median(refs.map((o) => o.descriptionLength));
  if (medDesc != null) {
    add(
      {
        factor: "Descripción",
        mine: `${n0(r.descriptionLength)} caracteres`,
        ref: `${n0(medDesc)} caracteres`,
        severity: medDesc > 0 ? Math.max(0, 1 - r.descriptionLength / medDesc) * 5 : 0,
        text: `su descripción tiene ${n0(r.descriptionLength)} caracteres y la de ${refLabel} ${n0(medDesc)}`,
      },
      r.descriptionLength < THRESHOLDS.minDescription || (medDesc > 0 && r.descriptionLength < medDesc * 0.6)
    );
  }

  const shareVideo = refs.filter((o) => o.videos > 0).length / refs.length;
  add(
    {
      factor: "Video",
      mine: r.videos > 0 ? "Sí" : "No",
      ref: `${n0(shareVideo * 100)} % lo tienen`,
      severity: 2,
      text: `no tiene video y ${n0(shareVideo * 100)} % de ${refLabel} sí`,
    },
    r.videos === 0 && shareVideo >= 0.5
  );

  const shareTour = refs.filter((o) => o.hasTour).length / refs.length;
  add(
    {
      factor: "Recorrido 360°",
      mine: r.hasTour ? "Sí" : "No",
      ref: `${n0(shareTour * 100)} % lo tienen`,
      severity: 3,
      text: `no tiene recorrido 360° y ${n0(shareTour * 100)} % de ${refLabel} sí`,
    },
    !r.hasTour && shareTour >= 0.5
  );

  const shareAmbient = refs.filter((o) => o.hasAmbientCover).length / refs.length;
  add(
    {
      factor: "Portada viva",
      mine: r.hasAmbientCover ? "Sí" : "No",
      ref: `${n0(shareAmbient * 100)} % la tienen`,
      severity: 2,
      text: `no tiene portada viva y ${n0(shareAmbient * 100)} % de ${refLabel} sí`,
    },
    !r.hasAmbientCover && shareAmbient >= 0.5
  );

  const dwell = avgDwellSec(r.d30);
  if (dwell != null && bench.medianDwellSec != null && r.d30.dwellSamples >= THRESHOLDS.dwellMinSamples) {
    add(
      {
        factor: "Tiempo en la ficha",
        mine: `${dwell} s`,
        ref: `${n0(bench.medianDwellSec)} s (típico)`,
        severity: 2,
        text: `la gente se queda ${dwell} s en la ficha y lo típico es ${n0(bench.medianDwellSec)} s`,
      },
      dwell < bench.medianDwellSec * THRESHOLDS.dwellDropFactor
    );
  }

  const changes = recentChanges(p, r.id, 30, env.now).flatMap((e) => e.changes.filter((c) => IMPACT_FIELDS.includes(c.field)).map((c) => ({ c, at: e.at })));
  const last = changes[0];
  if (last) {
    findings.push({
      factor: "Cambio reciente",
      mine: daysAgo(last.at, env.now),
      ref: "—",
      severity: 2,
      text: `${lcFirst(describeChange(last.c).text)} ${daysAgo(last.at, env.now)}, así que parte del movimiento puede deberse a eso`,
    });
  }

  return { findings: findings.sort((a, b) => b.severity - a.severity), rows, refLabel, refCount: refs.length };
}

export const investigate: AgencyHandler = (env) => {
  const { portfolio: p } = env;
  let targets = targetRows(env).filter((r) => r.status === "published");

  // Sin una propiedad concreta: investigar las que tienen el desbalance visitas/consultas, o las que más lo necesitan.
  if (targets.length === 0) {
    targets = p.rows.filter((r) => r.diagnostics.some(isFlagged)).sort((a, b) => b.d30.views - a.d30.views);
  }
  if (targets.length === 0) {
    targets = p.rows.filter((r) => r.diagnostics.some((d) => d.kind === "attention" && d.severity !== "low")).slice(0, 3);
  }
  if (targets.length === 0) {
    return {
      lead: "No veo ninguna propiedad con un problema claro para investigar. Decime el nombre de una y la reviso, o mirá primero cuáles andan peor.",
      blocks: [],
      followUps: dedupeSuggestions([sug("agency.worst", "¿Cuáles andan peor?"), sug("agency.review_first", "¿Qué debería revisar primero?")]),
    };
  }

  targets = targets.slice(0, 3);
  const blocks: AdvisorBlock[] = [];
  const summary: string[] = [];
  let surprised = false;

  for (const r of targets) {
    const { findings, rows, refLabel, refCount } = investigateRow(r, env);
    if (targets.length > 1) blocks.push({ type: "text", text: quote(r.title, 60) });
    if (refCount === 0 || rows.length === 0) {
      blocks.push({ type: "caveat", text: `No tengo otras propiedades con las que comparar a ${quote(r.title)}, así que no puedo decir qué la diferencia.` });
      continue;
    }
    blocks.push({
      type: "table",
      caption: `${quote(r.title, 50)} frente a ${refLabel} (${refCount})`,
      columns: [
        { key: "factor", label: "Factor" },
        { key: "mine", label: "Esta propiedad", align: "right" },
        { key: "ref", label: "Referencia", align: "right" },
      ],
      rows: rows.map((f) => ({
        factor: f.factor,
        mine: { text: f.mine, tone: findings.includes(f) ? ("bad" as const) : ("neutral" as const) },
        ref: f.ref,
      })),
    });
    if (findings.length > 0) {
      summary.push(`${quote(r.title, 40)}: ${findings.slice(0, 2).map((f) => f.text).join("; ")}`);
      if (findings.length >= 3) surprised = true;
    } else {
      summary.push(`${quote(r.title, 40)}: no veo una diferencia clara con ${refLabel}`);
    }
  }

  const first = targets[0]!;
  const caveat =
    "Son diferencias que pueden estar influyendo, no una prueba de causa: con pocos datos conviene cambiar una cosa por vez y mirar el resultado.";
  const lead =
    summary.length > 0
      ? `Comparé ${targets.length === 1 ? "la propiedad" : "las propiedades"} con tus otras publicaciones. ${summary.join(". ")}.`
      : "No pude armar una comparación con los datos actuales.";
  blocks.push({ type: "caveat", text: caveat });

  return {
    lead,
    blocks,
    followUps: dedupeSuggestions([
      sug("agency.simulate_price", "¿Qué pasaría si bajo el precio?", { slots: { propertyIds: targets.map((t) => t.id), percent: -5 } }),
      sug("agency.photos", "¿Necesita mejores fotos?"),
      sug("agency.property_status", "Ver cómo viene", { slots: { propertyIds: [first.id] } }),
    ]),
    actions: [{ label: "Editar la propiedad", href: editHref(first), kind: "primary" }],
    resultIds: targets.map((t) => t.id),
    focusPropertyId: first.id,
    mood: surprised ? "surprised" : "neutral",
  };
};

// ─── Qué cambió respecto del período anterior ────────────────────────────────

export const changesVsPrevious: AgencyHandler = async (env) => {
  const { portfolio: p, now } = env;
  // "Respecto del mes pasado" compara el mes actual; todo lo demás compara semanas.
  const period: PeriodId = env.slots.period === "month" || env.slots.period === "prev_month" ? "month" : "week";
  const prevPeriod = previousOf(period);

  const [curMap, prevMap] = await Promise.all([totalsByProperty(env, period), totalsByProperty(env, prevPeriod)]);
  const cur = sumTotals(curMap);
  const prev = sumTotals(prevMap);

  if (cur.views + prev.views + consultas(cur) + consultas(prev) === 0) {
    return {
      lead: `No registré visitas ni consultas ni en ${periodWord(period)} ni en ${periodWord(prevPeriod)}, así que no hay nada que comparar todavía.`,
      blocks: [],
      followUps: dedupeSuggestions([sug("agency.actions", "¿Qué me recomendás hacer?")]),
    };
  }

  const dViews = change(cur.views, prev.views);
  const dCons = change(consultas(cur), consultas(prev));
  const dSaves = change(cur.saves, prev.saves);

  const movers = p.rows
    .map((r) => ({ r, a: curMap.get(r.id)!.views, b: prevMap.get(r.id)!.views }))
    .map((x) => ({ ...x, diff: x.a - x.b }))
    .filter((x) => Math.abs(x.diff) >= 5);
  const ups = movers.filter((m) => m.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 3);
  const downs = movers.filter((m) => m.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 3);

  const range = periodRange(period, now);
  const changesInWindow = p.activity.filter((e) => e.at >= range.from && (e.kind === "property_updated" || e.kind === "property_created"));
  const touched = new Set(changesInWindow.map((e) => e.propertyId).filter(Boolean));

  const parts: string[] = [];
  if (dViews != null && prev.views > 0) parts.push(`las visitas ${dViews >= 0 ? "subieron" : "bajaron"} ${pct(Math.abs(dViews), { digits: 0 })} (${n0(cur.views)} contra ${n0(prev.views)})`);
  else parts.push(`tuviste ${n0(cur.views)} ${plural(cur.views, "visita", "visitas")} y antes ${n0(prev.views)}`);
  if (dCons != null && consultas(prev) > 0) parts.push(`las consultas ${dCons >= 0 ? "subieron" : "bajaron"} ${pct(Math.abs(dCons), { digits: 0 })} (${n0(consultas(cur))} contra ${n0(consultas(prev))})`);
  let lead = `${cap(periodWord(period))}, ${list(parts)}.`;
  if (changesInWindow.length > 0) {
    lead += ` En ese tiempo hiciste ${count(changesInWindow.length, "cambio", "cambios")} en ${count(touched.size, "propiedad", "propiedades")}${touched.size > 0 ? ", y los tengo en cuenta abajo" : ""}.`;
  }

  const blocks: AdvisorBlock[] = [
    {
      type: "metrics",
      items: [
        tile("Visitas", cur.views, prev.views),
        tile("Consultas", consultas(cur), consultas(prev)),
        tile("Favoritos", cur.saves, prev.saves),
        tile("Visitas al 360°", cur.tourOpens, prev.tourOpens),
      ],
    },
  ];

  const moverRef = (m: { r: PropertyRow; a: number; b: number }) =>
    propRef(m.r, env, { chips: [`${n0(m.a)} visitas (antes ${n0(m.b)})`, `${signedPct(change(m.a, m.b), 0)}`] });
  if (ups.length > 0) blocks.push({ type: "properties", title: "Las que más subieron", items: ups.map(moverRef) });
  if (downs.length > 0) blocks.push({ type: "properties", title: "Las que más bajaron", items: downs.map(moverRef) });

  if (changesInWindow.length > 0) {
    blocks.push({
      type: "timeline",
      items: changesInWindow.slice(0, 5).map((e) => {
        const d = describeEntry(e);
        return { at: e.at.toISOString(), title: d.title, detail: d.detail, tone: d.tone };
      }),
    });
  }

  const followUps: SuggestionQuery[] = [];
  if (downs.length > 0) followUps.push(sug("agency.investigate", "Investigar las que bajaron", { slots: { propertyIds: downs.map((d) => d.r.id) }, tone: "warn" }));
  if (changesInWindow.length > 0) followUps.push(sug("agency.activity", "¿Qué cambié en ese período?", { slots: { period } }));
  followUps.push(sug("agency.actions", "¿Qué me recomendás hacer?"));
  void dSaves;

  return {
    lead,
    blocks,
    followUps: dedupeSuggestions(followUps),
    resultIds: [...downs, ...ups].map((m) => m.r.id),
    mood: dViews != null && Math.abs(dViews) >= 40 && Math.max(cur.views, prev.views) >= 20 ? "surprised" : "neutral",
  };
};

// ─── Qué revisar primero ─────────────────────────────────────────────────────

export const reviewFirst: AgencyHandler = (env) => {
  const { portfolio: p } = env;
  const weight = { high: 3, medium: 2, low: 1 } as const;
  const pool = filterRows(p.rows, env.slots);
  const ranked = pool
    .map((r) => {
      const att = r.diagnostics.filter((d) => d.kind === "attention");
      const priority = att.reduce((a, d) => a + weight[d.severity], 0) + (r.d30.views >= MIN_VIEWS && att.length > 0 ? 1 : 0);
      return { r, att, priority };
    })
    .filter((x) => x.att.length > 0)
    .sort((a, b) => b.priority - a.priority || b.r.d30.views - a.r.d30.views);

  const n = limitOf(env.slots.count ?? 4);
  const shown = ranked.slice(0, n);
  const draftNote = p.drafts.length > 0 ? ` Además tenés ${count(p.drafts.length, "borrador sin publicar", "borradores sin publicar")}.` : "";

  if (shown.length === 0) {
    return {
      lead: `No veo ninguna publicación urgente: no hay hallazgos que requieran atención.${draftNote} Si querés, miramos oportunidades para seguir mejorando.`,
      blocks: [],
      followUps: dedupeSuggestions([sug("agency.opportunities", "¿Qué oportunidades tengo?"), sug("agency.best", "¿Cuáles funcionan mejor?")]),
    };
  }

  const items = sortDiagnostics(shown.flatMap((s) => s.att.slice(0, 1)));
  const first = shown[0]!;
  const lead = `Yo empezaría por ${quote(first.r.title)}${first.att[0] ? `: ${first.att[0].title.toLowerCase()}` : ""}.${shown.length > 1 ? ` Después seguiría con ${list(shown.slice(1, 3).map((s) => quote(s.r.title)))}.` : ""}${draftNote}`;

  return {
    lead,
    blocks: [{ type: "diagnostics", items }],
    followUps: dedupeSuggestions([
      sug("agency.investigate", "Investigar la primera", { slots: { propertyIds: [first.r.id] }, tone: "warn" }),
      sug("agency.actions", "¿Qué me recomendás hacer?"),
      sug("agency.photos", "¿Cuáles necesitan mejores fotos?"),
    ]),
    actions: [{ label: "Editar la primera", href: editHref(first.r), kind: "primary" }],
    resultIds: shown.map((s) => s.r.id),
    focusPropertyId: first.r.id,
  };
};

