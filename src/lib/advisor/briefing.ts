/**
 * Lo que el asesor dice y sugiere al abrirse, ANTES de que el usuario
 * pregunte: un saludo, uno o dos titulares sobre lo que detectó y hasta seis
 * preguntas listas para tocar — cada una con el dato de adelanto. Se arma con
 * los mismos datos que las respuestas, así que cambia apenas la inmobiliaria
 * edita algo (la clave de caché incluye su última acción registrada).
 */
import { Property } from "@/lib/db/models/Property";
import { memo } from "@/lib/intelligence/cache";
import { consultas } from "@/lib/intelligence/metrics";
import { getTasteProfile } from "@/lib/intelligence/user-profile";
import { IMPACT_FIELDS } from "./analysis/correlate";
import { FIELD_KEYS, FIELD_LABEL, eventsOf } from "./analysis/agency/scenarios";
import { measureImpact } from "./analysis/agency/impact";
import { MIN_VIEWS } from "./analysis/agency/shared";
import { change, clip, count, n0, plural, quote, signedPct } from "./compose/format";
import { INTENT_LABELS, defaultSuggestions } from "./compose/labels";
import { dedupeSuggestions, sug } from "./compose/suggest";
import { typeLabel } from "./compose/vocab";
import { loadMarketPulse, topZones } from "./data/market";
import { loadPortfolio, type Portfolio } from "./data/portfolio";
import type { AdvisorBriefing, ChangeField, Slots, SuggestionQuery, Tone } from "./types";

const DAY_MS = 86_400_000;
const MAX_SUGGESTIONS = 6;

/** Saludo según la hora en Argentina (UTC-3). */
function salute(now: Date): string {
  const hour = new Date(now.getTime() - 3 * 3_600_000).getUTCHours();
  return hour < 12 ? "Buen día" : hour < 20 ? "Buenas tardes" : "Buenas noches";
}

type Candidate = { priority: number; suggestion: SuggestionQuery };
type Headline = { priority: number; text: string; tone: Tone };

function pickTop(candidates: Candidate[], max: number): SuggestionQuery[] {
  const seen = new Set<string>();
  const out: SuggestionQuery[] = [];
  for (const c of [...candidates].sort((a, b) => b.priority - a.priority)) {
    const key = `${c.suggestion.intent}:${JSON.stringify(c.suggestion.slots ?? {})}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c.suggestion);
    if (out.length >= max) break;
  }
  return out;
}

// ─── Inmobiliaria ────────────────────────────────────────────────────────────

export async function agencyBriefing(agencyId: string | null, persona: { name: string }, now = new Date()): Promise<AdvisorBriefing> {
  const p = await loadPortfolio(agencyId);
  // La clave incluye la última acción registrada: cambiar algo renueva las sugerencias al instante.
  const stamp = p.activity[0]?.at.getTime() ?? 0;
  return memo(`advisor:${agencyId ?? "all"}:briefing:${stamp}:${persona.name}`, 60_000, () => buildAgency(p, persona, now));
}

async function buildAgency(p: Portfolio, persona: { name: string }, now: Date): Promise<AdvisorBriefing> {
  const hello = `${salute(now)}. Soy ${persona.name}.`;

  if (p.rows.length === 0) {
    return {
      greeting: `${hello} Todavía no tenés propiedades publicadas; apenas publiques la primera empiezo a seguirla y a contarte qué conviene hacer.`,
      headlines: [],
      suggestions: [sug("common.help", INTENT_LABELS["common.help"])],
      mood: "neutral",
    };
  }

  const cands: Candidate[] = [];
  const heads: Headline[] = [];

  const w7 = p.intel.totals.w7;
  const p7 = p.intel.totals.p7;
  const dViews = change(w7.views, p7.views);
  const traffic = p.intel.totals.d30.views;

  // 1. Cambios recientes: ¿sirvieron? (el dato de adelanto sale de medir antes/después de verdad)
  const recent = eventsOf(
    p.activity.filter((e) => e.at.getTime() <= now.getTime() - 4 * DAY_MS && e.at.getTime() >= now.getTime() - 21 * DAY_MS),
    IMPACT_FIELDS
  );
  const seenEvent = new Set<string>();
  let measured = 0;
  for (const ev of recent) {
    const key = `${ev.entry.propertyId}:${ev.change.field}`;
    if (seenEvent.has(key) || measured >= 2) continue;
    seenEvent.add(key);
    const row = ev.entry.propertyId ? p.byId.get(ev.entry.propertyId) : undefined;
    if (!row || row.status !== "published") continue;
    const field = (Object.entries(FIELD_KEYS).find(([, keys]) => keys.includes(ev.change.field))?.[0] ?? "price") as ChangeField;
    const impact = await measureImpact({ now }, row, ev.entry.at);
    measured++;
    const rel = impact.delta.views != null ? impact.delta.views - (impact.controlViews ?? 0) : null;
    cands.push({
      priority: impact.sufficient ? 92 : 60,
      suggestion: sug("agency.change_impact", `¿Sirvió cambiar ${FIELD_LABEL[field]} de ${quote(row.title, 26)}?`, {
        slots: { propertyIds: [row.id], field },
        hint: impact.sufficient && impact.delta.views != null ? `${signedPct(impact.delta.views, 0)} visitas/día` : undefined,
        tone: rel != null && rel >= 25 ? "good" : rel != null && rel <= -25 ? "warn" : "neutral",
      }),
    });
    if (impact.sufficient && rel != null && Math.abs(rel) >= 25) {
      heads.push({
        priority: 90,
        text: `Desde que cambiaste ${FIELD_LABEL[field]} de ${quote(row.title, 30)}, sus visitas por día ${rel > 0 ? "subieron" : "bajaron"} ${n0(Math.abs(impact.delta.views ?? 0))} %.`,
        tone: rel > 0 ? "good" : "bad",
      });
    }
  }

  // 2. Muchas visitas, pocas consultas.
  const flagged = p.rows.filter((r) => r.diagnostics.some((d) => d.id.startsWith("high-views-low-inquiries") || d.id.startsWith("saves-no-inquiries")));
  if (flagged.length > 0) {
    const top = [...flagged].sort((a, b) => b.d30.views - a.d30.views).slice(0, 3);
    cands.push({
      priority: 80,
      suggestion: sug("agency.investigate", "Investigar por qué no consultan", {
        slots: { propertyIds: top.map((r) => r.id) },
        hint: count(flagged.length, "propiedad", "propiedades"),
        tone: "warn",
      }),
    });
    heads.push({
      priority: 70,
      text: `${count(flagged.length, "propiedad recibe", "propiedades reciben")} muchas visitas pero pocas consultas${flagged.length === 1 ? `: ${quote(top[0]!.title, 40)}` : ""}.`,
      tone: "bad",
    });
  }

  // 3. Clientes sin seguimiento.
  if (p.intel.leads.stale > 0) {
    cands.push({
      priority: 76,
      suggestion: sug("agency.leads", "¿Qué clientes tengo sin seguimiento?", { hint: count(p.intel.leads.stale, "cliente", "clientes"), tone: "warn" }),
    });
    heads.push({ priority: 72, text: `${count(p.intel.leads.stale, "cliente lleva", "clientes llevan")} demasiado tiempo sin seguimiento.`, tone: "bad" });
  }

  // 4. Movimiento de la semana.
  if (dViews != null && p7.views >= 10 && w7.views >= 20 && Math.abs(dViews) >= 15) {
    cands.push({
      priority: 70,
      suggestion: sug("agency.changes_vs_previous", `¿Por qué ${dViews > 0 ? "subieron" : "bajaron"} las visitas?`, { hint: `${signedPct(dViews, 0)} vs la semana pasada`, tone: dViews > 0 ? "good" : "warn" }),
    });
    heads.push({
      priority: 75,
      text: `Esta semana tus visitas ${dViews > 0 ? "subieron" : "bajaron"} ${n0(Math.abs(dViews))} % (${n0(w7.views)} contra ${n0(p7.views)}).`,
      tone: dViews > 0 ? "good" : "bad",
    });
  }

  // 5. Publicaciones con tráfico y datos faltantes / sin 360°.
  const incomplete = p.rows.filter((r) => r.diagnostics.some((d) => d.id.startsWith("incomplete-listing")) && r.d30.views >= MIN_VIEWS);
  if (incomplete.length > 0) {
    cands.push({ priority: 50, suggestion: sug("agency.incomplete", "¿Qué publicaciones están incompletas?", { hint: count(incomplete.length, "con tráfico", "con tráfico"), tone: "warn" }) });
  }
  const noTour = p.rows.filter((r) => !r.hasTour && r.d30.views >= MIN_VIEWS);
  if (noTour.length > 0) {
    cands.push({ priority: 46, suggestion: sug("agency.opportunities", "¿Qué oportunidades no estoy aprovechando?", { hint: `${noTour.length} sin 360° y con visitas` }) });
  }

  // 6. Fondo: lo útil de siempre, con el dato disponible.
  if (p.rows.filter((r) => r.d30.views > 0).length >= 4) {
    cands.push({ priority: 40, suggestion: sug("agency.traits", "¿Qué tienen en común las que mejor funcionan?") });
  }
  const consultasWeek = consultas(w7);
  cands.push({ priority: 38, suggestion: sug("agency.promote", "¿Qué conviene promocionar esta semana?") });
  cands.push({
    priority: 34,
    suggestion: sug("agency.overview", "Dame un resumen general", { hint: `${n0(w7.views)} ${plural(w7.views, "visita", "visitas")} · ${n0(consultasWeek)} ${plural(consultasWeek, "consulta", "consultas")}` }),
  });
  cands.push({ priority: 30, suggestion: sug("agency.actions", "¿Qué me recomendás hacer?") });
  cands.push({ priority: 22, suggestion: sug("agency.activity", "¿Qué cambié últimamente?") });

  heads.sort((a, b) => b.priority - a.priority);
  const headlines = heads.slice(0, 2).map(({ text, tone }) => ({ text, tone }));
  if (headlines.length === 0) {
    headlines.push({
      text: traffic < 20 ? "Todavía hay pocas visitas medidas: apenas haya más tráfico te cuento qué se mueve." : "Todo estable: no veo nada urgente hoy.",
      tone: "neutral" as Tone,
    });
  }

  const notable = heads.some((h) => h.priority >= 75 && h.tone !== "neutral");
  return {
    greeting: `${hello} Ya miré tus números.`,
    headlines,
    suggestions: pickTop(cands, MAX_SUGGESTIONS),
    mood: notable ? "surprised" : "neutral",
  };
}

// ─── Explorador ──────────────────────────────────────────────────────────────

export async function explorerBriefing(opts: {
  userId: string | null;
  focusPropertyId?: string;
  persona: { name: string };
  now?: Date;
}): Promise<AdvisorBriefing> {
  const now = opts.now ?? new Date();
  const hello = `${salute(now)}. Soy ${opts.persona.name}.`;
  const cands: Candidate[] = [];
  const headlines: { text: string; tone?: Tone }[] = [];

  // Si está mirando una propiedad, lo primero que le sirve es opinar sobre ESA propiedad.
  if (opts.focusPropertyId) {
    const doc = await Property.findOne({ _id: opts.focusPropertyId, status: "published" })
      .select("type operation address.neighborhood address.city title")
      .lean();
    if (doc) {
      const zone = doc.address?.neighborhood ?? doc.address?.city ?? undefined;
      const base: Slots = { types: [doc.type], operation: doc.operation, ...(zone ? { zones: [zone] } : {}) };
      cands.push({ priority: 95, suggestion: sug("explorer.price_check", "¿Está bien de precio?", { slots: { propertyIds: [opts.focusPropertyId] } }) });
      cands.push({ priority: 90, suggestion: sug("explorer.search", `Más como esta${zone ? ` en ${zone}` : ""}`, { slots: { ...base } }) });
      cands.push({ priority: 85, suggestion: sug("explorer.price_typical", `¿Cuánto cuesta ${typeLabel(doc.type, false)} en ${zone ?? "la zona"}?`, { slots: { ...base } }) });
      cands.push({ priority: 70, suggestion: sug("explorer.price_drops", "¿Alguna similar bajó de precio?", { slots: { ...base } }) });
      headlines.push({ text: `Estás mirando ${quote(clip(doc.title, 44))}. Te ayudo a ver si el precio acompaña y a compararla.`, tone: "neutral" });
    }
  }

  // Con cuenta: se arma con lo que la propia persona viene mirando y guardando.
  if (opts.userId) {
    const profile = await getTasteProfile(opts.userId).catch(() => null);
    const zone = profile?.neighborhoods[0]?.key;
    const type = profile?.types[0]?.key;
    cands.push({ priority: 88, suggestion: sug("explorer.recommend", "Recomendame propiedades para mí", { hint: profile && profile.sampleSize > 0 ? "según lo que venís mirando" : undefined, tone: "good" }) });
    if (zone) {
      cands.push({ priority: 82, suggestion: sug("explorer.new", `Novedades en ${zone}`, { slots: { zones: [zone] } }) });
      cands.push({ priority: 78, suggestion: sug("explorer.price_drops", `Bajas de precio en ${zone}`, { slots: { zones: [zone] } }) });
      cands.push({ priority: 66, suggestion: sug("explorer.price_typical", `¿Cuánto cuesta ${type ? typeLabel(type, false) : "una propiedad"} en ${zone}?`, { slots: { zones: [zone], ...(type ? { types: [type as never] } : {}) } }) });
    }
  }

  // Pulso del mercado (para todos).
  const pulse = await loadMarketPulse().catch(() => null);
  if (pulse) {
    if (pulse.newThisWeek > 0) {
      headlines.push({ text: `Esta semana se publicaron ${count(pulse.newThisWeek, "propiedad nueva", "propiedades nuevas")}${pulse.drops > 0 ? ` y ${count(pulse.drops, "bajó", "bajaron")} de precio` : ""}.`, tone: "good" });
      cands.push({ priority: 60, suggestion: sug("explorer.new", "¿Qué hay de nuevo?", { hint: `${pulse.newThisWeek} esta semana` }) });
    }
    if (pulse.drops > 0) cands.push({ priority: 64, suggestion: sug("explorer.price_drops", "¿Cuáles bajaron de precio?", { hint: `${pulse.drops} en 14 días`, tone: "good" }) });
  }

  const zones = await topZones(2).catch(() => []);
  for (const z of zones) cands.push({ priority: 40, suggestion: sug("explorer.search", `Propiedades en ${z.zone}`, { slots: { zones: [z.zone] }, hint: `${z.count} publicadas` }) });
  cands.push({ priority: 44, suggestion: sug("explorer.with_tour", "Con recorrido 360°") });
  cands.push({ priority: 36, suggestion: sug("explorer.popular", "¿Cuáles son las más populares?") });
  if (!opts.userId) cands.push({ priority: 50, suggestion: sug("explorer.recommend", "Recomendame propiedades") });
  for (const d of defaultSuggestions("explorer")) cands.push({ priority: 10, suggestion: d });

  return {
    greeting: `${hello} Contame qué buscás, o elegí una opción:`,
    headlines: headlines.slice(0, 2),
    suggestions: dedupeSuggestions(pickTop(cands, MAX_SUGGESTIONS)),
    mood: "neutral",
  };
}
