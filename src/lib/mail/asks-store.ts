/**
 * Qué preguntó cada mail y qué pasó con cada pregunta, en una forma que se puede guardar y contar. Antes todo esto se calculaba al
 * redactar la respuesta y se perdía: sólo quedaba "cuántas faltaron". Con esto la bandeja muestra qué se contestó y qué quedó para una
 * persona, y el analista puede decir "5 personas preguntaron las expensas de «Casa X» y no están cargadas". Módulo puro.
 */
import { askLabel } from "@/lib/agents/knowledge/asks";
import type { AnswerItem } from "@/lib/agents/knowledge/answers";

export { ASK_STATES, type AskState } from "./constants";
import type { AskState } from "./constants";

export type StoredAsk = { key: string; label: string; state: AskState; propertyId?: string };

/** Tope por mail: una consulta con muchísimas preguntas no tiene que inflar el documento. */
export const MAX_STORED_ASKS = 16;

/** Las preguntas de un mail, de todas las propiedades a las que se refiere, más las que nadie sabe contestar (`other`). */
export function storedAsks(perProperty: { propertyId: string; items: AnswerItem[] }[], other: readonly string[] = []): StoredAsk[] {
  const out: StoredAsk[] = [];
  for (const p of perProperty) {
    for (const i of p.items) out.push({ key: i.key, label: askLabel(i.key), state: i.known ? "answered" : "missing", propertyId: p.propertyId });
  }
  for (const q of other) out.push({ key: "other", label: q.slice(0, 80), state: "human" });
  return out.slice(0, MAX_STORED_ASKS);
}

/** Cuántas hay de cada estado. */
export function askCounts(asks: readonly { state: string }[]): Record<AskState, number> {
  const c: Record<AskState, number> = { answered: 0, missing: 0, human: 0 };
  for (const a of asks) if (a.state in c) c[a.state as AskState]++;
  return c;
}
