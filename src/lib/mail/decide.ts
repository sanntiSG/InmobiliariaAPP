/**
 * ¿Esta respuesta puede salir SOLA o tiene que confirmarla una persona? Sólo sale sola cuando se cumplen TODAS las
 * condiciones: modo automático, categoría permitida, el agente está seguro, no hay nada que deba contestar una persona,
 * el remitente pasó las verificaciones del correo, el mail nombra una propiedad publicada (o pide algo concreto que la
 * inmobiliaria tiene publicado, si se permite), está en horario, no se pasó de los topes del día y de la persona y no se le
 * respondió ya a ese hilo. Cualquier duda: confirmación, con el motivo en palabras comunes. Función pura.
 */
import type { MailCategory, MailMode } from "./constants";

export const AUTO_MIN_CONFIDENCE = 0.75;

export type AutoInput = {
  settings: {
    mode: MailMode;
    autoCategories: readonly string[];
    autoPerDay: number;
    /** Respuestas automáticas a la misma persona por día. */
    autoPerSender: number;
    /** También responder solo las búsquedas ("casas en venta en Ezeiza") cuando hay propiedades que coinciden. */
    autoSearches: boolean;
    schedule: { enabled: boolean; from: string; to: string };
  };
  category: MailCategory;
  confidence: number;
  needsHuman: boolean;
  /** El servidor del remitente no pasó SPF/DKIM/DMARC. */
  authFailed: boolean;
  /**
   * El mail pide que se responda a OTRA dirección (`Reply-To` distinto del remitente) y no viene de un portal conocido.
   * Quien escribe controla ese encabezado: una respuesta automática podría terminar en la casilla de un tercero.
   */
  replyElsewhere: boolean;
  /** Propiedades publicadas que el mail nombra (un enlace o el título). */
  availableProperties: number;
  /** Propiedades publicadas que coinciden con lo que PIDE (no un reemplazo cuando no hay nada parecido). */
  searchMatches: number;
  /** Cuántas cosas concretas pide (tipo, operación, lugar, plata, ambientes, comodidades). */
  searchStrength: number;
  /** Respuestas automáticas ya enviadas hoy desde este buzón. */
  sentToday: number;
  /** Cuántas respuestas se le dieron a esta persona en las últimas 24 horas (enviadas, en cola o confirmadas a mano). */
  repliesToSender: number;
  /** Ya se respondió en este mismo hilo. */
  threadAnswered: boolean;
  /** La propiedad no se nombró en este mail: se retomó la de una conversación anterior con la misma persona. */
  inherited?: boolean;
  /** Preguntas puntuales ("¿tiene pileta?") que la publicación no puede contestar porque el dato no está cargado. */
  unanswered?: number;
  now: Date;
};

const ARG_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false });

/** "HH:MM" de la hora de Argentina. */
export function argentinaClock(now: Date): string {
  return ARG_TIME.format(now).replace(/^24:/, "00:");
}

/** ¿`now` cae entre `from` y `to` (hora de Argentina)? Acepta rangos que cruzan la medianoche (22:00–06:00). */
export function inSchedule(now: Date, from: string, to: string): boolean {
  const t = argentinaClock(now);
  if (!/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to)) return false;
  return from <= to ? t >= from && t < to : t >= from || t < to;
}

export type AutoDecision = { auto: boolean; why: string };

export function decideAuto(i: AutoInput): AutoDecision {
  const hold = (why: string): AutoDecision => ({ auto: false, why });
  if (i.settings.mode !== "auto") return hold("El agente está en modo confirmación.");
  if (!i.settings.autoCategories.includes(i.category)) return hold("Este tipo de consulta se confirma siempre.");
  if (i.confidence < AUTO_MIN_CONFIDENCE) return hold("No estoy del todo seguro de qué pregunta.");
  if (i.needsHuman) return hold("Hay algo que tiene que contestar una persona.");
  if (i.inherited) return hold("No nombró la propiedad: retomé la de su consulta anterior y conviene que revises que sea esa.");
  if (i.unanswered && i.unanswered > 0) return hold("Preguntó algo que la publicación no tiene cargado: revisá la respuesta antes de enviarla.");
  if (i.authFailed) return hold("El remitente no pasó las verificaciones del correo (puede ser falso).");
  if (i.replyElsewhere) return hold("Pide que se responda a otra dirección distinta de la que escribió.");
  if (i.availableProperties < 1) {
    if (i.searchStrength < 1) return hold("No identifiqué de qué propiedad habla.");
    if (!i.settings.autoSearches) return hold("Pide algo en general, no una propiedad puntual, y las respuestas automáticas a búsquedas están desactivadas.");
    if (i.searchMatches < 1) return hold("Pide algo que no tengo publicado: te dejo la respuesta para que la veas antes de enviarla.");
  }
  if (i.settings.schedule.enabled && !inSchedule(i.now, i.settings.schedule.from, i.settings.schedule.to)) return hold("Está fuera del horario de respuesta automática.");
  if (i.sentToday >= i.settings.autoPerDay) return hold("Ya se llegó al tope de respuestas automáticas de hoy.");
  if (i.repliesToSender >= i.settings.autoPerSender) {
    return hold(`A esta persona ya se le respondió ${i.repliesToSender} ${i.repliesToSender === 1 ? "vez" : "veces"} hoy (el tope es ${i.settings.autoPerSender}).`);
  }
  if (i.threadAnswered) return hold("Ya se respondió en esta conversación.");
  return { auto: true, why: i.availableProperties >= 1 ? "Cumple todas las condiciones para responderse sola." : "Pide algo que tenés publicado y cumple todas las condiciones para responderse sola." };
}
