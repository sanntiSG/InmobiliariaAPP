/**
 * Cuánto se parece una frase a otras, sobre sus raíces de palabra (sin tildes, plurales ni conjugaciones). Es la misma medida
 * que usa el asesor para comparar lo que le preguntan con sus frases de ejemplo, y ahora también la usan las lecciones que le
 * enseña el admin y el agente de correo. Puro: se prueba sin base de datos.
 */
import { normalizeText, stems } from "@/lib/advisor/nlu/normalize";

/** Las raíces de una frase, como conjunto. */
export function stemSet(text: string): Set<string> {
  return new Set(stems(normalizeText(text)));
}

/** Coeficiente de Dice entre `question` y la frase más parecida de `examples` (0 a 1). */
export function bestDice(question: ReadonlySet<string>, examples: readonly ReadonlySet<string>[]): number {
  if (question.size === 0) return 0;
  let best = 0;
  for (const ex of examples) {
    let shared = 0;
    for (const t of question) if (ex.has(t)) shared++;
    const dice = (2 * shared) / (question.size + ex.size);
    if (dice > best) best = dice;
  }
  return best;
}
