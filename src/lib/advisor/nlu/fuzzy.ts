/**
 * Tolerancia a errores de tipeo: distancia de Damerau-Levenshtein (con
 * transposiciones, "propeidad" → "propiedad") acotada por un máximo para
 * cortar rápido cuando las palabras no se parecen.
 */

/** Cantidad de errores tolerados según el largo: las palabras cortas deben coincidir exacto. */
export function allowedTypos(length: number): number {
  if (length >= 9) return 2;
  if (length >= 5) return 1;
  return 0;
}

/** Distancia de edición entre `a` y `b`; devuelve `max + 1` apenas se supera `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) rows.push(new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) rows[i]![0] = i;
  for (let j = 0; j <= b.length; j++) rows[0]![j] = j;

  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, rows[i - 2]![j - 2]! + 1);
      }
      rows[i]![j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
  }
  return rows[a.length]![b.length]!;
}

/** ¿`word` es `target` con a lo sumo los errores de tipeo tolerados para su largo? */
export function isTypoOf(word: string, target: string): boolean {
  const max = allowedTypos(Math.min(word.length, target.length));
  if (max === 0) return word === target;
  return editDistance(word, target, max) <= max;
}

/** La palabra más parecida del vocabulario (dentro de la tolerancia), o `null`. */
export function closestWord(word: string, vocabulary: Iterable<string>): string | null {
  const max = allowedTypos(word.length);
  if (max === 0) return null;
  let best: string | null = null;
  let bestDist = max + 1;
  for (const candidate of vocabulary) {
    const d = editDistance(word, candidate, Math.min(max, bestDist - 1));
    if (d < bestDist) {
      best = candidate;
      bestDist = d;
      if (d === 1 && max === 1) break;
    }
  }
  return best;
}
