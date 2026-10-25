/**
 * ¿Esta respuesta puede salir SOLA o tiene que confirmarla una persona? Sólo sale sola cuando se cumplen TODAS las
 * condiciones: modo automático, categoría permitida, el agente está seguro, no hay nada que deba contestar una persona,
 * el remitente pasó las verificaciones del correo, se identificó una propiedad disponible, está en horario, no se pasó de
 * los topes del día y no se le respondió ya a esa persona ni a ese hilo. Cualquier duda: confirmación. Función pura.
 */
import type { MailCategory, MailMode } from "./constants";

export const AUTO_MIN_CONFIDENCE = 0.75;

export type AutoInput = {
  settings: {
    mode: MailMode;
    autoCategories: readonly string[];
    autoPerDay: number;
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
  /** Propiedades publicadas que se identificaron en el mail. */
  availableProperties: number;
  /** Respuestas automáticas ya enviadas hoy desde este buzón. */
  sentToday: number;
  /** A esta persona se le respondió en las últimas 24 horas. */
  senderRepliedRecently: boolean;
  /** Ya se respondió en este mismo hilo. */
  threadAnswered: boolean;
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
  if (i.authFailed) return hold("El remitente no pasó las verificaciones del correo (puede ser falso).");
  if (i.replyElsewhere) return hold("Pide que se responda a otra dirección distinta de la que escribió.");
  if (i.availableProperties < 1) return hold("No identifiqué de qué propiedad habla.");
  if (i.settings.schedule.enabled && !inSchedule(i.now, i.settings.schedule.from, i.settings.schedule.to)) return hold("Está fuera del horario de respuesta automática.");
  if (i.sentToday >= i.settings.autoPerDay) return hold("Ya se llegó al tope de respuestas automáticas de hoy.");
  if (i.senderRepliedRecently) return hold("A esta persona ya se le respondió hoy.");
  if (i.threadAnswered) return hold("Ya se respondió en esta conversación.");
  return { auto: true, why: "Cumple todas las condiciones para responderse sola." };
}
