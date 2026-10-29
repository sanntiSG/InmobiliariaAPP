/**
 * Qué datos concretos de una propiedad pregunta alguien ("¿tiene pileta?", "¿cuánto son las expensas?", "¿cuántos metros?").
 * Es conocimiento compartido: lo usan el agente de correo (para contestar cada pregunta de un mail) y el asesor (para contestar
 * sobre una ficha). Sólo DETECTA qué se pregunta; cómo se contesta está en `answers.ts`. Función pura sobre texto en minúsculas
 * y sin tildes: se prueba sin base de datos.
 *
 * Las comodidades (pileta, cochera, mascotas…) no se detectan acá: ya las lee el entendimiento del asesor (`extractSlots`) y se
 * pasan como parámetro, así hay un solo vocabulario de comodidades.
 */
import { AMENITY_LABELS, type Amenity } from "@/config/filters";
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

/** La clave de una pregunta: `expenses`, `area`… o `amenity:pileta`. Es lo que se guarda para poder agrupar y contar. */
export const askKey = (a: Ask): string => (a.kind === "amenity" && a.amenity ? `amenity:${a.amenity}` : a.kind);

const KIND_LABELS: Record<Exclude<AskKind, "amenity">, string> = {
  expenses: "expensas",
  area: "superficie",
  bedrooms: "dormitorios",
  bathrooms: "baños",
  rooms: "ambientes",
  age: "antigüedad",
  floor: "piso",
  orientation: "orientación",
  place: "ubicación",
  tour: "recorrido 360°",
  video: "videos",
};

/** Cómo se llama una pregunta en pantalla ("expensas", "pileta"). */
export function askLabel(key: string): string {
  if (key.startsWith("amenity:")) {
    const a = key.slice(8) as Amenity;
    return (AMENITY_LABELS[a] ?? a).toLowerCase();
  }
  return KIND_LABELS[key as keyof typeof KIND_LABELS] ?? key;
}

/** Palabras de lo que el agente ya sabe tratar (precio, visita, financiación, mascotas…): una pregunta que las usa no es "desconocida". */
const KNOWN_TOPICS =
  /\b(?:precio|valor|cuesta|cuanto|sale|vale|disponib\w*|libre|sigue|alquilad\w*|vendid\w*|reservad\w*|visit\w*|ver(?:la|lo|las|los)?|conocer\w*|coordinar|turno|horarios?|dias?|fotos?|planos?|financ\w*|cuotas?|anticipo|credito|hipotec\w*|garantia|garante|requisitos?|contrato|deposito|mascotas?|permuta\w*|escritura|comision|honorarios|tasa\w*|vender|alquil\w*|venta|propiedad(?:es)?|casa|casas|departamentos?|deptos?|monoambiente|ph|terreno|lote|local|oficina|cochera|pileta|jardin|balcon|terraza|parrilla|amoblad\w*|apto|abl|impuestos?|servicios?|llam\w*|telefon\w*|whatsapp|contact\w*|comunic\w*|escrib\w*|datos?|informacion|info|detalles?|pasan|pasar|mandan|mandar|envian|enviar|opcion|opciones|dolares?|pesos|usd|presupuesto)\b/;
/** Cortesías y pedidos de ayuda sin una pregunta concreta. */
const COURTESY =
  /\b(?:como (?:esta|estan|andan|va)|que tal|me (?:podes|puedes|podrian|pueden|podria) (?:ayudar|responder|contestar)|podrian (?:responder|contestar|ayudarme)|alguien (?:me )?(?:puede|podria)|hay alguien)\b/;

const plain = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Las preguntas explícitas (con signo de pregunta) que NADA de lo que el agente sabe contesta: ni un dato de la ficha, ni una
 * comodidad, ni un tema que ya trata (precio, visita, financiación…). Por ejemplo "¿Cómo es el proceso de la reserva?". Sirve para
 * decir "esa otra consulta la revisa una persona" y avisar al equipo, en vez de responder como si no hubiera preguntado nada.
 * Es conservadora a propósito: necesita el signo de pregunta y al menos cuatro palabras, así no marca saludos ni frases sueltas.
 * Devuelve hasta 3, acotadas. Función pura.
 */
export function uncoveredQuestions(raw: string): string[] {
  const out: string[] = [];
  for (const sentence of raw.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/)) {
    if (!sentence.includes("?")) continue;
    const text = sentence.replace(/^[¿\s]+/, "").trim();
    const p = plain(text);
    if (p.split(" ").filter((w) => w.length > 1).length < 4) continue;
    if (KNOWN_TOPICS.test(p) || COURTESY.test(p) || detectAsks(p, []).length > 0) continue;
    if (
      AMENITY_PATTERNS.some(([re]) => {
        re.lastIndex = 0;
        return re.test(p);
      })
    )
      continue;
    out.push(text.slice(0, 120));
    if (out.length >= 3) break;
  }
  return out;
}

/** ¿El texto pregunta algo (signo de pregunta, arranca con una palabra interrogativa o con "tiene/hay/acepta…")? */
export function soundsLikeQuestion(raw: string): boolean {
  if (/[?¿]/.test(raw)) return true;
  const plain = raw.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return /(?:^|[.!\n]\s*)(?:cuanto|cuanta|cuantos|cuantas|cuando|donde|como|que|cual|cuales|hay|tienen|tiene|tenes|acepta|aceptan|incluye|incluyen|permite|permiten|esta|estan|es|son|puedo|podemos)\b/m.test(plain) ||
    /\b(?:quisiera saber|quiero saber|me gustaria saber|necesito saber|queria saber|consulto si|consultar si|pregunto si|averiguar si)\b/.test(plain);
}
