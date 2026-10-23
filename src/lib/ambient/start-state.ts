import { AMBIENT_START_AUTO } from "./constants";

/** Estado "ideal" según la hora local: noche de 20 a 6, atardecer de 18 a 20, día el resto. La lluvia y el viento nunca se eligen solos. */
function idealForHour(hour: number): "day" | "dusk" | "night" {
  if (hour >= 20 || hour < 6) return "night";
  if (hour >= 18) return "dusk";
  return "day";
}

/** Si el estado ideal no está activo, se prueba el más parecido en luz. */
const FALLBACKS: Record<"day" | "dusk" | "night", string[]> = {
  day: ["day", "dusk", "night"],
  dusk: ["dusk", "day", "night"],
  night: ["night", "dusk", "day"],
};

/**
 * Estado con el que abre la portada viva. `start` es un id fijo elegido por la inmobiliaria o `"auto"` (según la hora
 * de quien mira). Siempre devuelve uno de `active`; si no hay ninguno de día/atardecer/noche, el primero de la lista.
 */
export function resolveStartState(active: string[], start: string, date: Date = new Date()): string {
  if (active.length === 0) throw new Error("La portada viva necesita al menos un estado activo.");
  if (start !== AMBIENT_START_AUTO && active.includes(start)) return start;
  const wanted = FALLBACKS[idealForHour(date.getHours())];
  return wanted.find((id) => active.includes(id)) ?? active[0]!;
}
