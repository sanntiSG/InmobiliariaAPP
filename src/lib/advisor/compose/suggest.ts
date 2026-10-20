import type { IntentId, Slots, SuggestionQuery } from "../types";

/** Una sugerencia que se resuelve como consulta estructurada (sin pasar por el lenguaje). */
export function sug(
  intent: IntentId,
  label: string,
  opts: { slots?: Slots; hint?: string; tone?: SuggestionQuery["tone"] } = {}
): SuggestionQuery {
  return { intent, label, ...opts };
}

/** Quita sugerencias repetidas (misma intención y mismos datos) conservando el orden. */
export function dedupeSuggestions(list: SuggestionQuery[]): SuggestionQuery[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const key = `${s.intent}:${JSON.stringify(s.slots ?? {})}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
