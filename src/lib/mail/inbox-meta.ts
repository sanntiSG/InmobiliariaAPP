/**
 * Cómo se presenta cada mail en la bandeja: qué le pasó (la etiqueta), qué tiene que hacer quien lo ve (la acción) y con qué tono. Una
 * sola tabla de reglas para que lo que dice la lista, el resumen de arriba y el cajón del mail coincidan. Módulo puro: sin base de
 * datos ni pantalla, lo prueba `mail:check`.
 */
import { HOLD_LABELS, type HoldCode, type MailMessageStatus } from "./constants";
import type { HumanState } from "./messages";

export type RowTone = "action" | "warn" | "danger" | "done" | "quiet";

export type RowLabel = {
  /** Qué le pasó a este mail, en pocas palabras. */
  label: string;
  /** Qué tiene que hacer quien lo ve ("Revisá y enviá la respuesta"); vacío si no hay nada que hacer. */
  hint: string;
  tone: RowTone;
};

type RowInput = {
  status: MailMessageStatus;
  auto: boolean;
  uncertain: boolean;
  humanState: HumanState;
  humanTopics: readonly string[];
  /** Por qué se ignoró (sólo en lo ignorado). */
  reason?: string | null;
};

const list = (topics: readonly string[]): string => topics.slice(0, 2).join(", ");

export function rowLabel(m: RowInput): RowLabel {
  if (m.status === "failed") return { label: "No se pudo enviar", hint: "Abrilo y reintentá el envío", tone: "danger" };
  if (m.status === "awaiting_confirmation") {
    if (m.uncertain) return { label: "No supe qué necesita", hint: "Leelo y respondele vos", tone: "warn" };
    if (m.humanState === "pending") return { label: m.humanTopics.length > 0 ? `Falta tu respuesta: ${list(m.humanTopics)}` : "Falta tu respuesta", hint: "Revisá la respuesta y completala antes de enviar", tone: "warn" };
    return { label: "Para confirmar", hint: "Revisá y enviá la respuesta", tone: "action" };
  }
  if ((m.status === "sent" || m.status === "queued" || m.status === "sending") && m.humanState === "pending") {
    return { label: m.humanTopics.length > 0 ? `Falta tu respuesta: ${list(m.humanTopics)}` : "Falta tu respuesta", hint: "Ya se le respondió con lo que se sabía: contestá lo demás", tone: "warn" };
  }
  if (m.status === "queued" || m.status === "sending") return { label: "Saliendo", hint: "", tone: "quiet" };
  if (m.status === "sent") return m.auto ? { label: "Respondido solo", hint: "", tone: "done" } : { label: "Respondido por una persona", hint: "", tone: "done" };
  if (m.status === "discarded") return { label: "Descartado", hint: "", tone: "quiet" };
  return { label: "Ignorado", hint: m.reason ?? "", tone: "quiet" };
}

/** Por qué no salió sola, en palabras (para el cajón del mail y la fila): el código si existe. */
export const holdText = (code: HoldCode | null | undefined): string | null => (code ? HOLD_LABELS[code] : null);

/** Cuántas preguntas hay y cómo van: "3 contestadas · 1 falta · 1 para una persona", o `null` si el mail no preguntó nada puntual. */
export function asksSummary(a: { answered: number; missing: number; human: number }): string | null {
  const total = a.answered + a.missing + a.human;
  if (total === 0) return null;
  const parts: string[] = [];
  if (a.answered > 0) parts.push(`${a.answered} ${a.answered === 1 ? "contestada" : "contestadas"}`);
  if (a.missing > 0) parts.push(a.missing === 1 ? "1 falta cargar" : `${a.missing} faltan cargar`);
  if (a.human > 0) parts.push(a.human === 1 ? "1 para una persona" : `${a.human} para una persona`);
  return parts.join(" · ");
}
