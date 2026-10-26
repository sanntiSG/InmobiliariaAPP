/**
 * Clasificador de la pregunta: puntúa cada intención del modo actual con las
 * señales de `intents.ts` más la similitud con sus frases de ejemplo, resuelve
 * seguimientos ("¿y en Canning?") con el contexto y decide si ejecuta, pide
 * una aclaración o admite que no entendió. Nunca inventa: con poca confianza
 * devuelve las opciones más probables para que el usuario elija.
 */
import type { AdvisorContext, AdvisorMode, IntentId, Slots } from "../types";
import { extractSlots, type EntityIndex } from "./entities";
import { detectConcepts } from "./lexicon";
import { INTENT_BY_ID, intentsFor, type ClassifyInput, type IntentDef } from "./intents";
import { bestDice } from "@/lib/agents/knowledge/similarity";
import { normalizeText, stems, tokenize } from "./normalize";

export type Alternative = { intent: IntentId; score: number };

export type Understanding =
  | { kind: "intent"; intent: IntentId; slots: Slots; confidence: number; alternatives: Alternative[]; followUp: boolean; norm: string }
  | { kind: "clarify"; slots: Slots; confidence: number; alternatives: Alternative[]; norm: string }
  | { kind: "unknown"; slots: Slots; alternatives: Alternative[]; norm: string };

/** Puntaje mínimo para ejecutar una intención sin preguntar. */
const ACCEPT = 6;
/** Diferencia mínima con la segunda para no considerar la pregunta ambigua. */
const MARGIN = 1.2;
/** Debajo de esto no hay ninguna pista razonable. */
const FLOOR = 3.5;
const EXAMPLE_WEIGHT = 8;
/** Verbos del léxico que no definen por sí solos qué se pregunta ("mostrame", "hola"). */
const PASSIVE_VERBS = new Set(["v.show", "v.search", "v.greeting", "v.thanks"]);
export const MAX_QUESTION_LENGTH = 300;

// Conjuntos de raíces de cada frase de ejemplo (se arman una sola vez).
const EXAMPLE_SETS = new Map<IntentId, Set<string>[]>();
function exampleSets(def: IntentDef): Set<string>[] {
  let sets = EXAMPLE_SETS.get(def.id);
  if (!sets) {
    sets = def.examples.map((e) => new Set(stems(normalizeText(e))));
    EXAMPLE_SETS.set(def.id, sets);
  }
  return sets;
}

/**
 * Lo que el admin le enseñó al asesor: frases (como conjuntos de raíces) por intención. Sólo SUMA: una pregunta muy parecida a una
 * frase enseñada sube el puntaje de esa intención (con un piso de parecido para que una coincidencia vaga no cuente), y nada
 * de lo enseñado resta puntaje a otra intención ni se salta las reglas.
 */
export type TaughtExamples = ReadonlyMap<string, readonly Set<string>[]>;

/** Parecido mínimo con una frase enseñada para que cuente. */
export const LESSON_MIN_SIMILARITY = 0.65;
/** Cuántos puntos vale una coincidencia perfecta con una frase enseñada (con 0,65 de parecido valen ~7,8: justo sobre `ACCEPT`). */
export const LESSON_WEIGHT = 12;

function score(def: IntentDef, input: ClassifyInput, questionStems: Set<string>, taught?: readonly Set<string>[]): number {
  const sim = taught && taught.length > 0 ? bestDice(questionStems, taught) : 0;
  const lesson = sim >= LESSON_MIN_SIMILARITY ? sim * LESSON_WEIGHT : 0;
  let total = 0;
  for (const s of def.signals) if (s.test(input)) total += s.w;
  // Las señales positivas son el piso: sin ninguna, sólo la similitud no alcanza para activar la intención.
  if (total === 0) return bestDice(questionStems, exampleSets(def)) * EXAMPLE_WEIGHT * 0.5 + lesson;
  for (const n of def.negatives ?? []) if (n.test(input)) total -= n.w;
  return Math.max(0, total) + bestDice(questionStems, exampleSets(def)) * EXAMPLE_WEIGHT + lesson;
}

/** Combina lo que se entendió ahora con lo conversado antes: lo nuevo pisa a lo anterior. */
function mergeSlots(previous: Slots | undefined, fresh: Slots): Slots {
  return { ...(previous ?? {}), ...fresh };
}

const hasEntities = (s: Slots): boolean =>
  !!(s.zones?.length || s.period || s.types?.length || s.propertyIds?.length || s.metric || s.operation || s.percent != null);

export function understand(
  text: string,
  mode: AdvisorMode,
  index: EntityIndex,
  ctx?: AdvisorContext,
  /** Frases que el admin le enseñó (opcional): ver `TaughtExamples`. */
  taught?: TaughtExamples
): Understanding {
  const norm = normalizeText(text.slice(0, MAX_QUESTION_LENGTH));
  const tokens = tokenize(norm);
  if (tokens.length === 0) return { kind: "unknown", slots: {}, alternatives: [], norm };

  const detected = detectConcepts(tokens);
  const slots = extractSlots(norm, tokens, detected, index, ctx);
  const input: ClassifyInput = { norm, tokens, detected, slots, ctx, mode };
  const qStems = new Set(stems(norm));

  const ranked: Alternative[] = intentsFor(mode)
    .map((def) => ({ intent: def.id, score: score(def, input, qStems, taught?.get(def.id)) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const second = ranked[1];
  const alternatives = ranked.filter((r) => r.score >= FLOOR).slice(0, 3);

  // Seguimientos: "¿y en Canning?", "¿y el mes pasado?", "¿y las casas?" reusan la intención anterior.
  // "y …" corto sin un verbo propio ("y si bajo el precio", "y cómo va…") sólo cambia un dato de lo anterior.
  const startsWithAnd = tokens[0] === "y" && tokens.length >= 2;
  const bestScore = best?.score ?? 0;
  const carriesOwnIntent = [...detected.keys()].some((c) => c.startsWith("v.") && !PASSIVE_VERBS.has(c));
  const elliptical = tokens.length <= 5 && hasEntities(slots) && bestScore < ACCEPT;
  if (
    ctx?.lastIntent &&
    intentAllowed(ctx.lastIntent, mode) &&
    ((startsWithAnd && tokens.length <= 6 && !carriesOwnIntent && hasEntities(slots)) || elliptical)
  ) {
    return {
      kind: "intent",
      intent: ctx.lastIntent,
      slots: mergeSlots(ctx.lastSlots, slots),
      confidence: 0.7,
      alternatives,
      followUp: true,
      norm,
    };
  }

  if (!best || bestScore < FLOOR) return { kind: "unknown", slots, alternatives, norm };

  const margin = bestScore - (second?.score ?? 0);
  const confident = bestScore >= ACCEPT && (margin >= MARGIN || (bestScore >= 9 && margin >= 0.6));
  if (!confident) return { kind: "clarify", slots, confidence: Math.min(1, bestScore / 14), alternatives, norm };

  // "por qué" sin otra pista continúa el tema anterior: se hereda lo conversado.
  const inherit = best.intent === "agency.investigate" && ctx?.lastSlots ? mergeSlots(ctx.lastSlots, slots) : slots;
  return {
    kind: "intent",
    intent: best.intent,
    slots: inherit,
    confidence: Math.min(1, bestScore / 14),
    alternatives,
    followUp: false,
    norm,
  };
}

function intentAllowed(intent: IntentId, mode: AdvisorMode): boolean {
  const def = INTENT_BY_ID.get(intent);
  return !!def && (def.audience === "both" || def.audience === mode) && !intent.startsWith("common.");
}
