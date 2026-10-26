/**
 * Qué datos concretos de una propiedad pregunta alguien ("¿tiene pileta?", "¿cuánto son las expensas?", "¿cuántos metros?").
 * Es conocimiento compartido: lo usan el agente de correo (para contestar cada pregunta de un mail) y el asesor (para contestar
 * sobre una ficha). Sólo DETECTA qué se pregunta; cómo se contesta está en `answers.ts`. Función pura sobre texto en minúsculas
 * y sin tildes: se prueba sin base de datos.
 *
 * Las comodidades (pileta, cochera, mascotas…) no se detectan acá: ya las lee el entendimiento del asesor (`extractSlots`) y se
 * pasan como parámetro, así hay un solo vocabulario de comodidades.
 */
import type { Amenity } from "@/config/filters";
import { AMENITY_PATTERNS } from "@/lib/advisor/nlu/entities";

export type AskKind = "amenity" | "expenses" | "area" | "rooms" | "bedrooms" | "bathrooms" | "age" | "floor" | "orientation" | "place" | "tour" | "video";

export type Ask = { kind: AskKind; amenity?: Amenity };

const PATTERNS: [AskKind, RegExp][] = [
  ["expenses", /\bexpensas?\b/],
  ["area", /\b(?:m2|mts2?|metros(?: cuadrados)?|superficie|cubiert[oa]s?|tamano|medidas?)\b|m²/],
  ["bedrooms", /\b(?:dormitorios?|dorm|habitaciones?|cuartos?)\b/],
  ["bathrooms", /\b(?:banos?|toilettes?)\b/],
  ["rooms", /\bambientes?\b/],
  ["age", /\b(?:antiguedad|cuantos anos|a estrenar|estrenar)\b/],
  ["floor", /\b(?:que piso|en que piso|a que piso|numero de piso|planta baja)\b/],
  ["orientation", /\b(?:orientacion|orientad[oa]|al frente|al contrafrente|da al (?:norte|sur|este|oeste))\b/],
  ["place", /\b(?:donde (?:queda|esta|se encuentra|se ubica)|ubicacion|en que (?:zona|barrio)|que (?:zona|barrio))\b/],
  ["tour", /\b(?:recorrido|tour|360|visita virtual)\b/],
  ["video", /\bvideos?\b/],
];

/**
 * Las cosas concretas que se preguntan, en el orden en que aparecen en el texto y sin repetir. `plain` es el texto en
 * minúsculas y sin tildes; `amenities` son las comodidades que ya detectó `extractSlots`.
 */
export function detectAsks(plain: string, amenities: readonly Amenity[] = []): Ask[] {
  const found: { at: number; ask: Ask }[] = [];
  for (const [kind, re] of PATTERNS) {
    const m = re.exec(plain);
    if (m) found.push({ at: m.index, ask: { kind } });
  }
  // Las comodidades se ubican donde aparece su palabra (con el vocabulario del asesor), así la respuesta sigue el orden del mail.
  for (const amenity of amenities) {
    const re = AMENITY_PATTERNS.find(([, a]) => a === amenity)?.[0];
    found.push({ at: re?.exec(plain)?.index ?? Number.MAX_SAFE_INTEGER, ask: { kind: "amenity", amenity } });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.ask);
}

/** ¿El texto pregunta algo (signo de pregunta, arranca con una palabra interrogativa o con "tiene/hay/acepta…")? */
export function soundsLikeQuestion(raw: string): boolean {
  if (/[?¿]/.test(raw)) return true;
  const plain = raw.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return /(?:^|[.!\n]\s*)(?:cuanto|cuanta|cuantos|cuantas|cuando|donde|como|que|cual|cuales|hay|tienen|tiene|tenes|acepta|aceptan|incluye|incluyen|permite|permiten|esta|estan|es|son|puedo|podemos)\b/m.test(plain) ||
    /\b(?:quisiera saber|quiero saber|me gustaria saber|necesito saber|queria saber|consulto si|consultar si|pregunto si|averiguar si)\b/.test(plain);
}
