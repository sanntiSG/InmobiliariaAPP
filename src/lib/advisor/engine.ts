/**
 * Motor del asesor. Orquesta las cuatro capas:
 *   datos (portfolio / mercado) → interpretación (nlu) → análisis (handlers) → presentación (compose).
 * No sabe nada de HTTP ni de la interfaz: recibe una pregunta y un alcance
 * ya autorizado y devuelve una `AdvisorAnswer`. Por eso mañana se le puede
 * enchufar un modelo de lenguaje en la capa de interpretación sin tocar el resto.
 */
import { AGENCY_INTENTS, EXPLORER_INTENTS, type AdvisorAnswer, type AdvisorContext, type AdvisorInput, type AdvisorMode, type AgencyIntent, type ExplorerIntent, type IntentId, type Slots } from "./types";
import { AGENCY_HANDLERS } from "./analysis/agency";
import { greeting, help, thanks } from "./analysis/common";
import { EXPLORER_HANDLERS } from "./analysis/explorer";
import type { Env, HandlerResult } from "./analysis/types";
import { pick, seedOf } from "./compose/format";
import { INTENT_LABELS, defaultSuggestions } from "./compose/labels";
import { dedupeSuggestions, sug } from "./compose/suggest";
import { loadMarketIndex } from "./data/market";
import { loadPortfolio, type Portfolio } from "./data/portfolio";
import { understand } from "./nlu/classify";
import { buildEntityIndex, type EntityIndex } from "./nlu/entities";
import { INTENT_BY_ID } from "./nlu/intents";

export type AskParams = {
  mode: AdvisorMode;
  /** Alcance ya autorizado: la inmobiliaria del usuario (o `null` = toda la plataforma, sólo admin). */
  agencyId: string | null;
  isAdmin: boolean;
  userId: string | null;
  input: AdvisorInput;
  context?: AdvisorContext;
  persona?: { name: string };
  now?: Date;
};

const MAX_FOLLOW_UPS = 5;
const MAX_IDS = 20;

const isAgencyIntent = (i: IntentId): i is AgencyIntent => (AGENCY_INTENTS as readonly string[]).includes(i);
const isExplorerIntent = (i: IntentId): i is ExplorerIntent => (EXPLORER_INTENTS as readonly string[]).includes(i);

const indexCache = new WeakMap<Portfolio, EntityIndex>();
function indexFor(p: Portfolio): EntityIndex {
  let idx = indexCache.get(p);
  if (!idx) {
    const all = [...p.rows, ...p.drafts];
    idx = buildEntityIndex({
      zones: all.flatMap((r) => [r.neighborhood, r.city].filter((z): z is string => !!z)),
      properties: all.map((r) => ({ id: r.id, title: r.title })),
    });
    indexCache.set(p, idx);
  }
  return idx;
}

/** Lo que llega del cliente nunca se confía: los ids se re-validan contra el alcance real. */
export function sanitizeContext(ctx: AdvisorContext, portfolio: Portfolio | null): AdvisorContext {
  const allowed = (id: string) => (portfolio ? portfolio.byId.has(id) : /^[a-f0-9]{24}$/.test(id));
  return {
    turn: Math.max(0, Math.min(1000, Math.floor(ctx.turn) || 0)),
    lastIntent: ctx.lastIntent && INTENT_BY_ID.has(ctx.lastIntent) ? ctx.lastIntent : undefined,
    lastSlots: ctx.lastSlots ? sanitizeSlots(ctx.lastSlots, portfolio) : undefined,
    resultIds: ctx.resultIds?.filter(allowed).slice(0, MAX_IDS),
    focusPropertyId: ctx.focusPropertyId && allowed(ctx.focusPropertyId) ? ctx.focusPropertyId : undefined,
  };
}

export function sanitizeSlots(s: Slots, portfolio: Portfolio | null): Slots {
  const out: Slots = { ...s };
  const okId = (id: string) => (portfolio ? portfolio.byId.has(id) : /^[a-f0-9]{24}$/.test(id));
  if (out.propertyIds) out.propertyIds = out.propertyIds.filter(okId).slice(0, MAX_IDS);
  if (out.zones) out.zones = out.zones.map((z) => z.slice(0, 60)).slice(0, 3);
  if (out.types) out.types = out.types.slice(0, 4);
  if (out.amenities) out.amenities = out.amenities.slice(0, 8);
  if (out.percent != null) out.percent = Math.max(-90, Math.min(200, out.percent));
  if (out.count != null) out.count = Math.max(1, Math.min(10, Math.floor(out.count)));
  if (out.text) out.text = out.text.slice(0, 120);
  for (const key of ["priceMax", "priceMin"] as const) {
    const m = out[key];
    if (m && (!Number.isFinite(m.amount) || m.amount <= 0)) delete out[key];
  }
  for (const k of Object.keys(out) as (keyof Slots)[]) {
    const v = out[k];
    if (v == null || (Array.isArray(v) && v.length === 0)) delete out[k];
  }
  return out;
}

/** Sólo lo necesario para continuar la charla (el contexto viaja en cada pregunta: tiene que ser chico). */
function slimSlots(s: Slots): Slots {
  const { text: _text, ...rest } = s;
  void _text;
  return rest;
}

function run(intent: IntentId, env: Env): Promise<HandlerResult> | HandlerResult {
  switch (intent) {
    case "common.greeting":
      return greeting(env);
    case "common.thanks":
      return thanks(env);
    case "common.help":
      return help(env);
  }
  if (isAgencyIntent(intent)) {
    if (!env.portfolio) throw new Error("Sin portfolio para una intención de inmobiliaria");
    return AGENCY_HANDLERS[intent]({ ...env, portfolio: env.portfolio });
  }
  if (isExplorerIntent(intent)) {
    const handler = EXPLORER_HANDLERS[intent];
    if (handler) return handler(env);
  }
  return {
    lead: "Esa consulta todavía no la puedo resolver. Probá con alguna de estas:",
    blocks: [],
    followUps: defaultSuggestions(env.mode),
  };
}

/**
 * ¿Esta consulta consume una pregunta del cupo gratuito? Sí cuando es una pregunta real
 * (escrita o tocada en un chip) que el asesor sabe resolver; el saludo, el agradecimiento,
 * la ayuda y lo que no entiende o necesita aclarar no cuentan. Sólo clasifica: no toca datos.
 */
export async function willConsumeQuota(params: Pick<AskParams, "mode" | "input" | "context">): Promise<boolean> {
  if (!("text" in params.input)) return !params.input.query.intent.startsWith("common.");
  const ctx = sanitizeContext(params.context ?? { turn: 0 }, null);
  const index = await loadMarketIndex();
  const u = understand(params.input.text, params.mode, index, ctx);
  return u.kind === "intent" && !u.intent.startsWith("common.");
}

export async function answer(params: AskParams): Promise<AdvisorAnswer> {
  const now = params.now ?? new Date();
  const mode = params.mode;
  const portfolio = mode === "agency" ? await loadPortfolio(params.agencyId) : null;
  const ctx = sanitizeContext(params.context ?? { turn: 0 }, portfolio);
  const index = portfolio ? indexFor(portfolio) : await loadMarketIndex();
  const persona = params.persona ?? { name: "tu asesor" };

  const baseContext: AdvisorContext = { ...ctx, turn: ctx.turn + 1 };

  let intent: IntentId;
  let slots: Slots;
  let confidence = 1;

  if ("text" in params.input) {
    const u = understand(params.input.text, mode, index, ctx);
    if (u.kind === "clarify") {
      const seed = seedOf("clarify", ctx.turn);
      return {
        intent: "clarify",
        confidence: u.confidence,
        mood: "neutral",
        lead: pick(
          ["No estoy seguro de haber entendido bien. ¿Te referís a alguna de estas?", "Puedo interpretarlo de más de una forma. ¿Cuál se acerca más a lo que querés saber?"],
          seed
        ),
        blocks: [],
        followUps: dedupeSuggestions(u.alternatives.map((a) => sug(a.intent, INTENT_LABELS[a.intent], { slots: sanitizeSlots(u.slots, portfolio) }))).slice(0, 3),
        actions: [],
        context: baseContext,
      };
    }
    if (u.kind === "unknown") {
      return {
        intent: "unknown",
        confidence: 0,
        mood: "neutral",
        lead:
          mode === "agency"
            ? "Eso no lo puedo responder con los datos de tu inmobiliaria. Puedo ayudarte con tus propiedades, visitas, consultas, cambios y qué mejorar. Por ejemplo:"
            : "No encontré cómo ayudarte con eso todavía. Puedo buscar propiedades, recomendarte, comparar precios y mostrarte lo que se mueve. Por ejemplo:",
        blocks: [],
        followUps: defaultSuggestions(mode).slice(0, 4),
        actions: [],
        context: baseContext,
      };
    }
    intent = u.intent;
    slots = sanitizeSlots(u.slots, portfolio);
    confidence = u.confidence;
  } else {
    const def = INTENT_BY_ID.get(params.input.query.intent);
    if (!def || !(def.audience === "both" || def.audience === mode)) {
      return {
        intent: "unknown",
        confidence: 0,
        mood: "neutral",
        lead: "Esa opción no está disponible acá.",
        blocks: [],
        followUps: defaultSuggestions(mode).slice(0, 4),
        actions: [],
        context: baseContext,
      };
    }
    intent = def.id;
    slots = sanitizeSlots(params.input.query.slots ?? {}, portfolio);
  }

  const env: Env = {
    mode,
    scope: { agencyId: params.agencyId },
    isAdmin: params.isAdmin,
    userId: params.userId,
    now,
    slots,
    context: ctx,
    seed: seedOf(intent, ctx.turn),
    persona,
    portfolio,
  };

  const result = await run(intent, env);

  const isCommon = intent.startsWith("common.");
  const nextContext: AdvisorContext = {
    turn: ctx.turn + 1,
    lastIntent: isCommon ? ctx.lastIntent : intent,
    lastSlots: isCommon ? ctx.lastSlots : slimSlots(slots),
    resultIds: result.resultIds ?? ctx.resultIds,
    focusPropertyId: result.focusPropertyId ?? ctx.focusPropertyId,
  };

  return {
    intent,
    confidence,
    mood: result.mood ?? "neutral",
    lead: result.lead,
    blocks: result.blocks,
    followUps: dedupeSuggestions(result.followUps).slice(0, MAX_FOLLOW_UPS),
    actions: result.actions ?? [],
    context: nextContext,
    simulated: result.simulated,
  };
}
