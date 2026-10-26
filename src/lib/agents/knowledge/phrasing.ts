/**
 * Cómo hablan los agentes: bancos de frases (una misma idea dicha de varias maneras) y una regla para elegir entre ellas que
 * evita lo más molesto de un asistente, repetirse. Es conocimiento compartido: lo usan el asesor, el agente de correo y el de
 * marketing, así los tres tienen la misma voz (castellano rioplatense, voseo, sin jerga) y la misma forma de variarla.
 *
 * La elección es determinista (sin azar): para la misma conversación en el mismo punto, la misma frase. Eso mantiene las
 * pruebas estables y hace que lo que se ve en pantalla sea reproducible. Y NUNCA repite la anterior: el número de turno avanza
 * una posición en el banco cada vez, así dos respuestas seguidas del mismo tipo no suenan igual.
 */
import { seedOf } from "@/lib/advisor/compose/format";

/**
 * Elige una variante de un banco. `bank` identifica el banco (cada uno arranca en una posición distinta, para que dos bancos
 * distintos no avancen sincronizados); `turn` es el número de turno de la conversación (o cualquier contador que crezca de a
 * uno): consecutivo ⇒ variante distinta mientras el banco tenga más de una.
 */
export function phrase<T extends string>(bank: string, variants: readonly T[], turn: number): T {
  if (variants.length === 0) throw new Error(`Banco de frases vacío: ${bank}`);
  return variants[(seedOf(bank) + Math.max(0, Math.floor(turn))) % variants.length]!;
}

/** Como `phrase`, pero con una semilla numérica (por ejemplo el id de un mail) en vez de un turno. Mismo mail ⇒ misma frase. */
export function phraseFor<T extends string>(bank: string, variants: readonly T[], seed: number): T {
  if (variants.length === 0) throw new Error(`Banco de frases vacío: ${bank}`);
  return variants[(seedOf(bank) + (seed >>> 0)) % variants.length]!;
}

/** Primera letra en minúscula, para encajar una frase dentro de otra ("Veo que te interesa departamentos…"). */
export const lowerFirst = (text: string): string => (text ? text.charAt(0).toLowerCase() + text.slice(1) : text);
