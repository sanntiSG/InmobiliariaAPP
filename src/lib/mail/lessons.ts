/**
 * Lo que una persona le enseñó al agente de correo ("este mail sí era una consulta" / "este no"), aplicado a un mail nuevo.
 * Puro: se prueba sin base de datos.
 *
 * Reglas, pensadas para que enseñar NUNCA vuelva al agente más confiado ni más tonto:
 * - Sólo mueve los casos DUDOSOS. Una consulta clara sigue siendo clara y un descarte firme (promoción, rebote, respuesta
 *   automática, basura) sigue siendo firme, enseñen lo que enseñen.
 * - Un mail descartado como "otra cosa" que se parece mucho a uno marcado como consulta pasa a "Para confirmar" (una persona lo
 *   mira); jamás se responde solo (queda con confianza baja y para revisar).
 * - Una consulta dudosa que se parece mucho a un mail marcado "no es una consulta" se descarta.
 * - La comparación es por raíces de palabra, sin guardar el texto del mail (ver `agents/lessons.ts`).
 */
import { maskPersonalData } from "@/lib/agents/knowledge/mask";
import { bestDice, stemSet } from "@/lib/agents/knowledge/similarity";
import { INQUIRY_CATEGORIES } from "./constants";
import { UNSURE_REASON, type Classification } from "./classify";

export type MailLessons = { inquiry: readonly ReadonlySet<string>[]; notInquiry: readonly ReadonlySet<string>[] };

/** Parecido mínimo con un mail marcado como consulta para pasar un descarte dudoso a revisión. */
export const LIFT_MIN_SIMILARITY = 0.6;
/** Parecido mínimo con un mail marcado "no es una consulta" para descartar una consulta dudosa. */
export const DISMISS_MIN_SIMILARITY = 0.7;
/** Lo mismo que se guarda al enseñar: asunto y comienzo del texto, enmascarados. */
export const LESSON_SOURCE_CHARS = 320;

export const LIFTED_REASON = "Se parece a un mail que una persona del equipo ya marcó como consulta.";
export const DISMISSED_REASON = "Se parece a un mail que una persona del equipo ya marcó como que no es una consulta.";

/** Las raíces de un mail con las que se compara y se enseña (asunto + comienzo, sin datos personales). */
export function mailFingerprint(subject: string, text: string): Set<string> {
  return stemSet(maskPersonalData(`${subject}\n${text}`, LESSON_SOURCE_CHARS));
}

export function applyMailLessons(base: Classification, subject: string, text: string, lessons: MailLessons | undefined): Classification {
  if (!lessons || (lessons.inquiry.length === 0 && lessons.notInquiry.length === 0)) return base;
  const isInquiry = INQUIRY_CATEGORIES.includes(base.category);
  // Sólo se tocan los dudosos: un descarte "blando" (otra cosa) o una consulta que el agente mismo no tenía clara.
  const softIgnore = !isInquiry && base.category === "other";
  const unsure = isInquiry && base.uncertain;
  if (!softIgnore && !unsure) return base;

  const print = mailFingerprint(subject, text);
  const yes = bestDice(print, lessons.inquiry);
  const no = bestDice(print, lessons.notInquiry);

  if (softIgnore && yes >= LIFT_MIN_SIMILARITY && yes > no) {
    return {
      ...base,
      category: "general",
      topics: ["general"],
      uncertain: true,
      needsHuman: true,
      // Baja a propósito: así nunca alcanza para responder solo; una persona lo revisa.
      confidence: 0.5,
      reasons: [UNSURE_REASON, LIFTED_REASON],
    };
  }
  if (unsure && no >= DISMISS_MIN_SIMILARITY && no > yes) {
    return { ...base, category: "other", topics: [], needsHuman: false, humanTopics: [], uncertain: false, confidence: 0.7, reasons: [DISMISSED_REASON] };
  }
  return base;
}
