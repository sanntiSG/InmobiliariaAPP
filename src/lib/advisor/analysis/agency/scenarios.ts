/**
 * Handlers de escenarios y seguimiento: simulación de precio (hipotética),
 * qué cambió la inmobiliaria, efecto real de un cambio, estado de una
 * propiedad y clientes sin seguimiento. Es donde el asesor usa la bitácora de
 * actividad para explicar los números.
 */
import { Types } from "mongoose";
import { Lead } from "@/lib/db/models/Lead";
import { benchFor } from "@/lib/intelligence/benchmarks";
import { consultas, getDailySeries, getLeadFunnels } from "@/lib/intelligence/metrics";
import { LEAD_STATUS_LABELS, isLeadStale, type LeadStatus } from "@/lib/leads/status";
import { describeChange, describeEntry } from "../../compose/activity-text";
import { change, count, daysAgo, list, median, money, n0, n1, pct, plural, quote, signedPct } from "../../compose/format";
import { phrase } from "@/lib/agents/knowledge/phrasing";
import { dedupeSuggestions, sug } from "../../compose/suggest";
import { periodRange } from "../../data/periods";
import type { ActivityEntry } from "../../data/activity";
import type { PropertyRow } from "../../data/portfolio";
import type { AdvisorBlock, ChangeField, PeriodId, SuggestionQuery, Tone } from "../../types";
import { IMPACT_FIELDS, annotate, recentChanges } from "../correlate";
import type { AgencyHandler } from "../types";
import { measureImpact, type ImpactResult } from "./impact";
import {
  MIN_VIEWS,
  editHref,
  propRef,
  statsHref,
  targetRows,
} from "./shared";

const DAY_MS = 86_400_000;

/** Qué campos de la bitácora corresponden a cada "tipo de cambio" que se puede nombrar. */
export const FIELD_KEYS: Record<ChangeField, string[]> = {
  price: ["price"],
  photos: ["photos", "cover", "photos_order"],
  description: ["description", "title"],
  videos: ["videos"],
  tour360: ["tour360", "tour360_links", "virtualTour"],
  ambient: ["ambientCover"],
};
export const FIELD_LABEL: Record<ChangeField, string> = {
  price: "el precio",
  photos: "las fotos",
  description: "la descripción",
  videos: "los videos",
  tour360: "el recorrido 360°",
  ambient: "la portada viva",
};
const FIELD_NOUN: Record<ChangeField, string> = {
  price: "precio",
  photos: "fotos",
  description: "descripción",
  videos: "videos",
  tour360: "recorrido 360°",
  ambient: "portada viva",
};

export const eventsOf = (entries: ActivityEntry[], keys: string[]) =>
  entries
    .filter((e) => (e.kind === "property_updated" || e.kind === "property_created") && e.propertyId)
    .flatMap((e) => e.changes.filter((c) => keys.includes(c.field)).map((c) => ({ entry: e, change: c })));

// ─── Simulación de precio ────────────────────────────────────────────────────

export const simulatePrice: AgencyHandler = async (env) => {
  const { portfolio: p } = env;
  let targets = targetRows(env).filter((r) => r.status === "published");
  if (targets.length === 0) {
    targets = p.rows
      .filter((r) => r.diagnostics.some((d) => d.id.startsWith("high-views-low-inquiries") || d.id.startsWith("stale-price")))
      .sort((a, b) => b.d30.views - a.d30.views);
  }
  if (targets.length === 0) targets = [...p.rows].sort((a, b) => b.d30.views - a.d30.views);
  targets = targets.slice(0, 3);

  if (targets.length === 0) {
    return {
      lead: phrase(
        "agency.simulate.none",
        ["No tengo propiedades publicadas para simular un cambio de precio.", "Sin propiedades publicadas no puedo simular un cambio de precio."],
        env.context.turn
      ),
      blocks: [],
      followUps: [sug("agency.overview", "Dame un resumen general")],
    };
  }

  const pcts = env.slots.percent != null ? [env.slots.percent] : [-5, -10, -15];
  const blocks: AdvisorBlock[] = [];

  for (const r of targets) {
    const peers = p.rows.filter((o) => o.id !== r.id && o.type === r.type && o.operation === r.operation && o.currency === r.currency);
    const peerPpm = median(peers.filter((o) => o.pricePerM2).map((o) => o.pricePerM2!));
    const peerPrice = median(peers.map((o) => o.price));

    const rows = pcts.map((pc) => {
      const next = Math.round(r.price * (1 + pc / 100));
      const ppm = r.area ? next / r.area : null;
      let position = "—";
      if (ppm && peerPpm && peers.filter((o) => o.pricePerM2).length >= 2) {
        const d = ((ppm - peerPpm) / peerPpm) * 100;
        position = `${signedPct(d, 0)} vs. la mediana de tus similares por m²`;
      } else if (peerPrice && peers.length >= 2) {
        const d = ((next - peerPrice) / peerPrice) * 100;
        position = `${signedPct(d, 0)} vs. el precio mediano de tus similares`;
      }
      return { label: `${signedPct(pc, 0)}`, value: `${money(next, r.currency)}${ppm ? ` · ${money(Math.round(ppm), r.currency)}/m²` : ""} · ${position}` };
    });

    blocks.push({
      type: "simulation",
      title: `${quote(r.title, 44)} — hoy ${money(r.price, r.currency)}${r.area ? ` (${money(Math.round(r.price / r.area), r.currency)}/m²)` : ""}`,
      rows,
      note: peers.length < 2 ? "Tengo pocas propiedades similares tuyas, así que no puedo ubicar el precio contra ellas." : "Cálculo hipotético sobre tus propiedades similares.",
    });
  }

  // ¿Qué pasó en TUS datos las otras veces que bajaste un precio? Sólo si hay casos suficientes.
  const drops = eventsOf(p.activity, ["price"]).filter(
    (x) => typeof x.change.before === "number" && typeof x.change.after === "number" && x.change.after < x.change.before * 0.97 && !x.entry.changes.some((c) => c.field === "currency")
  );
  const measurable = (
    await Promise.all(
      drops.slice(0, 8).map(async (x) => {
        const row = p.byId.get(x.entry.propertyId!);
        return row ? { x, row, impact: await measureImpact(env, row, x.entry.at) } : null;
      })
    )
  ).filter((m): m is NonNullable<typeof m> => !!m && m.impact.sufficient);

  let evidence: string;
  if (measurable.length >= 3) {
    const avg = (f: (i: ImpactResult) => number | null) => {
      const vals = measurable.map((m) => f(m.impact)).filter((v): v is number => v != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    const v = avg((i) => i.delta.views);
    const c = avg((i) => i.delta.consultas);
    const ctl = avg((i) => i.controlViews);
    evidence = `En tus propios datos hay ${measurable.length} bajas de precio medibles: las visitas por día cambiaron en promedio ${signedPct(v, 0)} y las consultas ${signedPct(c, 0)}${ctl != null ? `, mientras el resto de tu cartera se movió ${signedPct(ctl, 0)}` : ""}. Es un promedio de pocos casos, no una promesa.`;
  } else {
    evidence = `No puedo decirte cuántas consultas más generaría: en tus datos hay ${measurable.length} ${plural(measurable.length, "baja de precio medible", "bajas de precio medibles")} y necesito al menos 3 para sacar una tendencia. Lo que sí puedo mostrarte es dónde quedaría el precio frente a tus propiedades similares.`;
  }
  blocks.push({ type: "caveat", text: evidence });

  const first = targets[0]!;
  const pc = pcts[0]!;
  const lead =
    env.slots.percent != null
      ? `Con ${signedPct(pc, 0)}, ${quote(first.title)} pasaría de ${money(first.price, first.currency)} a ${money(Math.round(first.price * (1 + pc / 100)), first.currency)}.${targets.length > 1 ? ` Te dejo también ${list(targets.slice(1).map((t) => quote(t.title, 32)))}.` : ""} Esto es una simulación: no es un resultado real.`
      : `Te muestro ${quote(first.title)}${targets.length > 1 ? ` y ${count(targets.length - 1, "propiedad más", "propiedades más")}` : ""} con una baja de 5, 10 y 15 %. Esto es una simulación: no es un resultado real.`;

  return {
    lead,
    blocks,
    followUps: dedupeSuggestions([
      sug("agency.investigate", "Investigar por qué se consulta poco", { slots: { propertyIds: targets.map((t) => t.id) } }),
      sug("agency.similar_price", "¿Qué propiedades cuestan parecido?"),
      sug("agency.actions", "¿Qué más puedo hacer además del precio?"),
    ]),
    actions: [{ label: "Editar el precio", href: editHref(first), kind: "secondary" }],
    resultIds: targets.map((t) => t.id),
    focusPropertyId: first.id,
    simulated: true,
  };
};

// ─── Qué cambié ──────────────────────────────────────────────────────────────

export const activity: AgencyHandler = (env) => {
  const { portfolio: p, now } = env;
  const period: PeriodId = env.slots.period ?? "month";
  const range = periodRange(period, now);
  const ids = env.slots.propertyIds?.length ? new Set(env.slots.propertyIds) : null;
  const entries = p.activity.filter((e) => e.at >= range.from && e.at < range.to && (!ids || (e.propertyId && ids.has(e.propertyId))));

  if (entries.length === 0) {
    return {
      lead: `No registré cambios tuyos ${range.short === "hoy" || range.short === "ayer" ? range.short : `en ${range.label}`}${ids ? " en esa propiedad" : ""}. Ojo: el registro de cambios empezó con esta función, así que no tengo lo que se editó antes.`,
      blocks: [],
      followUps: dedupeSuggestions([sug("agency.actions", "¿Qué me recomendás cambiar?"), sug("agency.review_first", "¿Qué debería revisar primero?")]),
    };
  }

  const shown = entries.slice(0, 12);
  const items = shown.map((e) => {
    const d = describeEntry(e);
    const row = e.propertyId ? p.byId.get(e.propertyId) : undefined;
    return { at: e.at.toISOString(), title: d.title, detail: d.detail, tone: d.tone as Tone, href: row ? (row.status === "published" ? statsHref(row) : editHref(row)) : undefined };
  });

  const touched = new Set(entries.map((e) => e.propertyId).filter(Boolean));
  const last = entries[0]!;
  const lead = `${cap(range.short === "hoy" || range.short === "ayer" ? range.short : `En ${range.label}`)} hiciste ${count(entries.length, "cambio", "cambios")}${touched.size > 0 ? ` en ${count(touched.size, "propiedad", "propiedades")}` : ""}. El más reciente fue ${daysAgo(last.at, now)}: ${describeEntry(last).title.charAt(0).toLowerCase()}${describeEntry(last).title.slice(1)}.`;

  // Ofrece medir los cambios recientes que pueden mover números.
  const measurable = eventsOf(entries, IMPACT_FIELDS).slice(0, 2);
  const followUps: SuggestionQuery[] = measurable.flatMap(({ entry, change: c }) => {
    const row = entry.propertyId ? p.byId.get(entry.propertyId) : undefined;
    if (!row) return [];
    const field = (Object.entries(FIELD_KEYS).find(([, keys]) => keys.includes(c.field))?.[0] ?? "price") as ChangeField;
    return [sug("agency.change_impact", `¿Sirvió cambiar ${FIELD_LABEL[field]} de ${quote(row.title, 28)}?`, { slots: { propertyIds: [row.id], field }, hint: daysAgo(entry.at, now) })];
  });

  return {
    lead,
    blocks: [{ type: "timeline", items }],
    followUps: dedupeSuggestions([...followUps, sug("agency.changes_vs_previous", "¿Cómo cambiaron mis números?")]),
    resultIds: [...touched].filter((id): id is string => !!id).slice(0, 10),
  };
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ─── Efecto de un cambio ─────────────────────────────────────────────────────

function impactVerdict(i: ImpactResult): { text: string; tone: Tone } {
  if (i.delta.views == null) return { text: "no hay suficiente actividad para ver una diferencia", tone: "neutral" };
  if (i.controlViews == null) {
    return { text: "y no tengo un grupo de comparación confiable en esas fechas, así que tomalo con cuidado", tone: "neutral" };
  }
  const rel = i.delta.views - i.controlViews;
  const control = `mientras el resto de tu cartera se movió ${signedPct(i.controlViews, 0)}`;
  if (Math.abs(rel) < 15) return { text: `${control}: no se ve una diferencia clara`, tone: "neutral" };
  return rel > 0
    ? { text: `${control}: la propiedad mejoró unos ${n0(Math.abs(rel))} puntos más`, tone: "good" }
    : { text: `${control}: la propiedad cayó unos ${n0(Math.abs(rel))} puntos más`, tone: "bad" };
}

export const changeImpact: AgencyHandler = async (env) => {
  const { portfolio: p, now } = env;
  const field = env.slots.field;
  const keys = field ? FIELD_KEYS[field] : IMPACT_FIELDS;
  const named = targetRows(env, { fallbackToResults: false })[0] ?? (env.context.focusPropertyId ? p.byId.get(env.context.focusPropertyId) : undefined);

  let events = eventsOf(p.activity, keys).filter((x) => !named || x.entry.propertyId === named.id);
  // Un evento por propiedad y campo (el más reciente), así no se repite la misma medición.
  const seen = new Set<string>();
  events = events.filter((x) => {
    const k = `${x.entry.propertyId}:${x.change.field}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  events = events.slice(0, 3);

  if (events.length === 0) {
    const recent = p.activity.slice(0, 3).length;
    return {
      lead: `No tengo registrado ningún cambio ${field ? `de ${FIELD_NOUN[field]}` : "en tus publicaciones"}${named ? ` en ${quote(named.title)}` : ""}. El registro empezó con esta función: lo que cambies desde ahora lo voy a poder medir, a partir de 3 días de datos después de cada cambio.${recent > 0 ? " Si querés, te muestro lo último que registré." : ""}`,
      blocks: [],
      followUps: dedupeSuggestions([sug("agency.activity", "¿Qué cambié últimamente?"), sug("agency.actions", "¿Qué me recomendás cambiar?")]),
    };
  }

  const blocks: AdvisorBlock[] = [];
  const results: { row: PropertyRow; impact: ImpactResult; text: string }[] = [];
  for (const x of events) {
    const row = p.byId.get(x.entry.propertyId!);
    if (!row) continue;
    const impact = await measureImpact(env, row, x.entry.at);
    results.push({ row, impact, text: describeChange(x.change).text });
  }

  const sentences: string[] = [];
  let surprised = false;
  for (const { row, impact, text } of results) {
    const when = daysAgo(impact.at, now);
    if (!impact.sufficient) {
      sentences.push(`${text} en ${quote(row.title, 38)} (${when}): todavía no puedo medir el efecto porque ${impact.reason}.`);
      continue;
    }
    const verdict = impactVerdict(impact);
    if (verdict.tone !== "neutral") surprised = true;
    sentences.push(
      `${text} en ${quote(row.title, 38)} (${when}): las visitas por día pasaron de ${n1(impact.before.views)} a ${n1(impact.after.views)} (${signedPct(impact.delta.views, 0)}), ${verdict.text}.`
    );
    blocks.push({
      type: "metrics",
      items: [
        { label: `Visitas/día · ${quote(row.title, 24)}`, value: n1(impact.after.views), delta: impact.delta.views == null ? null : Math.round(impact.delta.views), hint: `antes ${n1(impact.before.views)}`, tone: verdict.tone },
        { label: "Consultas/día", value: n1(impact.after.consultas), delta: impact.delta.consultas == null ? null : Math.round(impact.delta.consultas), hint: `antes ${n1(impact.before.consultas)}` },
        { label: "Favoritos/día", value: n1(impact.after.saves), delta: impact.delta.saves == null ? null : Math.round(impact.delta.saves), hint: `antes ${n1(impact.before.saves)}` },
        ...(impact.controlViews != null ? [{ label: "Resto de tu cartera", value: signedPct(impact.controlViews, 0), hint: "visitas/día en las mismas fechas", tone: "neutral" as const }] : []),
      ],
    });
  }

  blocks.push({
    type: "caveat",
    text: `Comparé ${results[0]?.impact.beforeDays ?? "N"} días antes y después de cada cambio y lo contrasté con el resto de tu cartera. Aun así, una medición no prueba que el cambio sea la causa: pudieron influir otros factores.`,
  });

  const first = results[0]?.row;
  return {
    lead: sentences.join(" "),
    blocks,
    followUps: dedupeSuggestions([
      first ? sug("agency.property_status", "Ver cómo viene hoy", { slots: { propertyIds: [first.id] } }) : null,
      sug("agency.activity", "¿Qué más cambié?"),
      sug("agency.actions", "¿Qué más puedo mejorar?"),
    ].filter((s): s is SuggestionQuery => !!s)),
    resultIds: results.map((r) => r.row.id),
    focusPropertyId: first?.id,
    mood: surprised ? "surprised" : "neutral",
  };
};

// ─── Cómo va una propiedad ───────────────────────────────────────────────────

export const propertyStatus: AgencyHandler = async (env) => {
  const { portfolio: p, now } = env;
  const candidates = targetRows(env);
  // Varias coincidencias (títulos repetidos): se pregunta cuál en vez de elegir una al azar.
  if (candidates.length > 1 && env.slots.propertyIds?.length && !env.context.resultIds?.length) {
    return {
      lead: phrase(
        "agency.status.several",
        [`Hay ${candidates.length} propiedades que coinciden con ese nombre. ¿Cuál querés ver?`, `Encontré ${candidates.length} propiedades con ese nombre. ¿Cuál es la que buscás?`],
        env.context.turn
      ),
      blocks: [{ type: "properties", items: candidates.map((r) => propRef(r, env, { totals: r.d30, auto: false })) }],
      followUps: dedupeSuggestions(candidates.map((r) => sug("agency.property_status", `${quote(r.title, 28)} · ${money(r.price, r.currency)}`, { slots: { propertyIds: [r.id] } }))),
      resultIds: candidates.map((r) => r.id),
    };
  }
  const row = candidates[0];
  if (!row) {
    const top = [...p.rows].sort((a, b) => b.score - a.score).slice(0, 4);
    return {
      lead: phrase(
        "agency.status.ask",
        ["¿De cuál propiedad querés saber? Escribime su nombre, o elegí una de estas:", "Decime de qué propiedad se trata: escribime su nombre o elegí una de estas:", "¿Sobre cuál querés que te cuente? Escribí su nombre o tocá una de estas:"],
        env.context.turn
      ),
      blocks: [{ type: "properties", items: top.map((r) => propRef(r, env, { totals: r.d30, auto: false })) }],
      followUps: dedupeSuggestions(top.slice(0, 3).map((r) => sug("agency.property_status", quote(r.title, 34), { slots: { propertyIds: [r.id] } }))),
      resultIds: top.map((r) => r.id),
    };
  }

  const series = await getDailySeries({ propertyIds: [row.id] }, 14, now);
  const dViews = change(row.w7.views, row.p7.views);
  const tile = (label: string, cur: number, prev: number) => {
    const d = change(cur, prev);
    return { label, value: n0(cur), delta: d == null ? null : Math.round(d), tone: d == null ? ("neutral" as const) : d >= 10 ? ("good" as const) : d <= -10 ? ("bad" as const) : ("neutral" as const) };
  };

  const changes = recentChanges(p, row.id, 30, now);
  const note = annotate(row, p, now).note;
  const bench = benchFor(p.bench, row.type, row.operation);
  let lead = `${quote(row.title)} tuvo ${n0(row.w7.views)} ${plural(row.w7.views, "visita", "visitas")} esta semana${dViews != null && row.p7.views > 0 ? ` (${signedPct(dViews, 0)} contra la anterior)` : ""}, ${n0(consultas(row.w7))} ${plural(consultas(row.w7), "consulta", "consultas")} y ${n0(row.w7.saves)} ${plural(row.w7.saves, "favorito", "favoritos")}.`;
  const top = row.diagnostics.find((d) => d.kind === "attention") ?? row.diagnostics.find((d) => d.kind === "positive");
  if (top) lead += ` ${top.explanation}`;
  else if (row.d30.views >= MIN_VIEWS && bench.inquiryRate != null) lead += " No veo nada que requiera atención por ahora.";
  if (changes[0]) {
    const last = describeEntry(changes[0]).title.replace(/ en «.*$/, "");
    lead += ` Lo último que le cambiaste: ${last.charAt(0).toLowerCase()}${last.slice(1)} ${daysAgo(changes[0].at, now)}.`;
  }
  void note;

  const blocks: AdvisorBlock[] = [
    {
      type: "metrics",
      items: [
        tile("Visitas", row.w7.views, row.p7.views),
        tile("Consultas", consultas(row.w7), consultas(row.p7)),
        tile("Favoritos", row.w7.saves, row.p7.saves),
        tile("Visitas al 360°", row.w7.tourOpens, row.p7.tourOpens),
      ],
    },
  ];
  if (series.some((s) => s.views > 0)) {
    blocks.push({
      type: "trend",
      label: "Últimas 2 semanas",
      points: series.map((s) => ({ day: s.day, views: s.views, saves: s.saves, likes: s.likes, inquiries: s.inquiries, contacts: s.contacts })),
    });
  }
  if (row.diagnostics.length > 0) blocks.push({ type: "diagnostics", items: row.diagnostics.slice(0, 3) });
  if (changes.length > 0) {
    blocks.push({
      type: "timeline",
      items: changes.slice(0, 4).map((e) => {
        const d = describeEntry(e);
        return { at: e.at.toISOString(), title: d.title, detail: d.detail, tone: d.tone };
      }),
    });
  }

  const measurable = eventsOf(changes, IMPACT_FIELDS)[0];
  return {
    lead,
    blocks,
    followUps: dedupeSuggestions([
      measurable
        ? sug("agency.change_impact", "¿Sirvió el último cambio?", { slots: { propertyIds: [row.id] }, hint: daysAgo(measurable.entry.at, now) })
        : null,
      sug("agency.investigate", "Investigar a fondo", { slots: { propertyIds: [row.id] } }),
      sug("agency.simulate_price", "¿Qué pasaría si cambio el precio?", { slots: { propertyIds: [row.id], percent: -5 } }),
    ].filter((s): s is SuggestionQuery => !!s)),
    actions: [
      { label: "Ver estadísticas", href: statsHref(row), kind: "primary" },
      { label: "Editar", href: editHref(row), kind: "secondary" },
    ],
    resultIds: [row.id],
    focusPropertyId: row.id,
    mood: dViews != null && Math.abs(dViews) >= 40 && Math.max(row.w7.views, row.p7.views) >= 20 ? "surprised" : "neutral",
  };
};

// ─── Clientes ────────────────────────────────────────────────────────────────

export const leads: AgencyHandler = async (env) => {
  const { portfolio: p, now } = env;
  const agencyId = env.scope.agencyId;
  const [funnels, open] = await Promise.all([
    getLeadFunnels({ agencyId }),
    Lead.find({ ...(agencyId ? { agencyId: new Types.ObjectId(agencyId) } : {}), status: { $ne: "cerrado" } })
      .select("name propertyId status createdAt lastContactAt")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean(),
  ]);

  const f = funnels.total;
  if (f.total === 0 && open.length === 0) {
    return {
      lead: phrase(
        "agency.leads.none",
        [
          "Todavía no recibiste consultas por el formulario de las fichas, así que no hay clientes para seguir. Cuando lleguen, los voy a ordenar por quién lleva más tiempo sin respuesta.",
          "Aún no llegó ninguna consulta por el formulario de las fichas, así que no hay clientes que seguir. Cuando lleguen, los ordeno por quién espera hace más tiempo.",
        ],
        env.context.turn
      ),
      blocks: [],
      followUps: dedupeSuggestions([sug("agency.views_no_inquiries", "¿Qué propiedades tienen visitas pero no consultas?"), sug("agency.actions", "¿Cómo consigo más consultas?")]),
    };
  }

  const stale = open
    .filter((l) => isLeadStale(l, now.getTime()))
    .map((l) => {
      const last = l.lastContactAt ? new Date(l.lastContactAt) : new Date(l.createdAt);
      return { l, waited: Math.floor((now.getTime() - last.getTime()) / DAY_MS) };
    })
    .sort((a, b) => b.waited - a.waited);

  const blocks: AdvisorBlock[] = [
    {
      type: "metrics",
      items: [
        { label: "Clientes (90 días)", value: n0(f.total) },
        { label: "Contactados", value: n0(f.contacted), hint: f.total > 0 ? pct(f.contacted / f.total, { fromRatio: true, digits: 0 }) : undefined },
        { label: "Visitas realizadas", value: n0(f.visitDone), hint: f.total > 0 ? pct(f.visitDone / f.total, { fromRatio: true, digits: 0 }) : undefined },
        { label: "Sin seguimiento", value: n0(stale.length), tone: stale.length > 0 ? "bad" : "good" },
      ],
    },
  ];
  if (stale.length > 0) {
    blocks.push({
      type: "table",
      caption: "Los que más tiempo llevan sin contacto",
      columns: [
        { key: "who", label: "Cliente" },
        { key: "prop", label: "Propiedad" },
        { key: "stage", label: "Etapa" },
        { key: "wait", label: "Sin contacto", align: "right" },
      ],
      rows: stale.slice(0, 6).map(({ l, waited }) => ({
        who: l.name,
        prop: p.byId.get(String(l.propertyId))?.title ?? "—",
        stage: LEAD_STATUS_LABELS[l.status as LeadStatus] ?? l.status,
        wait: { text: `${waited} ${plural(waited, "día", "días")}`, tone: waited >= 7 ? ("bad" as const) : ("neutral" as const) },
      })),
    });
  }

  const lead =
    stale.length > 0
      ? `Tenés ${count(open.length, "cliente abierto", "clientes abiertos")} y ${count(stale.length, "lleva", "llevan")} demasiado tiempo sin seguimiento; el que más espera lleva ${stale[0]!.waited} ${plural(stale[0]!.waited, "día", "días")}. Responder rápido es lo que más pesa en una consulta.`
      : `Tenés ${count(open.length, "cliente abierto", "clientes abiertos")} y ninguno pasa los tiempos de espera: estás al día con el seguimiento.`;

  return {
    lead,
    blocks,
    followUps: dedupeSuggestions([sug("agency.views_no_inquiries", "¿Qué propiedades tienen visitas pero pocas consultas?"), sug("agency.actions", "¿Qué me recomendás hacer?")]),
    actions: [{ label: "Ir a Clientes", href: "/dashboard/clientes", kind: "primary" }],
    mood: stale.length >= 3 ? "surprised" : "neutral",
  };
};

