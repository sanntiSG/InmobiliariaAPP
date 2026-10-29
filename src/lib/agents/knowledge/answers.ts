/**
 * Contestar lo que se pregunta de una propiedad, con SUS datos y nada más: "Sí, tiene pileta y parrilla.", "Las expensas son
 * $120.000.", "En la publicación no figura cochera.". Conocimiento compartido (lo usan el agente de correo y el asesor): una
 * sola forma de decir las cosas y una sola regla de honestidad — si el dato no está cargado, se dice que no figura (nunca se
 * inventa ni se afirma un "no" que la publicación no puede sostener). Función pura.
 */
import { AMENITY_LABELS, type Amenity } from "@/config/filters";
import { list, money, n0 } from "@/lib/advisor/compose/format";
import { typeGender } from "@/lib/advisor/compose/vocab";
import { placeOf, type PropertyFacts } from "./facts";
import type { Ask } from "./asks";

/** Una pregunta puntual y si la publicación tenía el dato (`known`) o no. La clave es la de `askKey` (ver `asks.ts`). */
export type AnswerItem = { key: string; known: boolean };

export type AnswerSet = {
  /** Frases ya redactadas, en el orden en que se preguntó. */
  sentences: string[];
  /** Una entrada por pregunta (en las comodidades, una por cada comodidad): sirve para guardar qué se contestó y qué faltó. */
  items: AnswerItem[];
  /** Cuántas preguntas se contestaron con un dato de la publicación. */
  known: number;
  /** Cuántas preguntas quedaron sin dato en la publicación ("no figura"). */
  missing: number;
};

/** Comodidades que se dicen con "tiene …". */
const HAS: Partial<Record<Amenity, string>> = {
  pileta: "pileta",
  parrilla: "parrilla",
  balcon: "balcón",
  terraza: "terraza",
  jardin: "jardín",
  baulera: "baulera",
  seguridad_24h: "seguridad las 24 horas",
  gimnasio: "gimnasio",
  sum: "SUM",
  aire_acondicionado: "aire acondicionado",
  calefaccion: "calefacción",
};

/** Comodidades que son una condición ("acepta mascotas", "es apto crédito"): lo que se dice si SÍ y lo que no figura si no. */
const IS: Partial<Record<Amenity, { yes: string; not: string }>> = {
  mascotas: { yes: "acepta mascotas", not: "que acepte mascotas" },
  apto_credito: { yes: "es apto crédito", not: "que sea apto crédito" },
  apto_profesional: { yes: "es apto profesional", not: "que sea apto profesional" },
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "a", "a ni b", "a, b ni c": la lista de lo que NO figura. */
const nor = (items: string[]): string => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} ni ${items[items.length - 1]}`);

function amenityAnswers(p: PropertyFacts, amenities: Amenity[]): { sentences: string[]; known: number; missing: number; items: AnswerItem[] } {
  const items: AnswerItem[] = [];
  const has: string[] = [];
  const isYes: string[] = [];
  const lacks: string[] = [];
  for (const a of amenities) {
    if (a === "cochera") {
      const n = p.garages ?? 0;
      if (n > 0 || p.amenities.includes("cochera")) has.push(n > 1 ? `${n} cocheras` : "cochera");
      else lacks.push("cochera");
      items.push({ key: "amenity:cochera", known: n > 0 || p.amenities.includes("cochera") });
    } else if (a === "amoblado") {
      if (p.amenities.includes(a)) isYes.push(typeGender(p.type).the === "las" ? "está amoblada" : "está amoblado");
      else lacks.push(typeGender(p.type).the === "las" ? "que esté amoblada" : "que esté amoblado");
      items.push({ key: `amenity:${a}`, known: p.amenities.includes(a) });
    } else if (IS[a]) {
      if (p.amenities.includes(a)) isYes.push(IS[a]!.yes);
      else lacks.push(IS[a]!.not);
      items.push({ key: `amenity:${a}`, known: p.amenities.includes(a) });
    } else {
      const label = HAS[a] ?? (AMENITY_LABELS[a] ?? a).toLowerCase();
      if (p.amenities.includes(a)) has.push(label);
      else lacks.push(label);
      items.push({ key: `amenity:${a}`, known: p.amenities.includes(a) });
    }
  }
  const sentences: string[] = [];
  if (has.length > 0) sentences.push(`Sí, tiene ${list(has)}.`);
  if (isYes.length > 0) sentences.push(has.length > 0 ? `Además, ${list(isYes)}.` : `Sí, ${list(isYes)}.`);
  if (lacks.length > 0) sentences.push(`En la publicación no figura ${nor(lacks)}.`);
  return { sentences, known: has.length + isYes.length, missing: lacks.length, items };
}

/**
 * Las respuestas a lo que se preguntó de UNA propiedad. Las comodidades se juntan en una o dos frases ("Sí, tiene pileta y
 * parrilla." / "En la publicación no figura cochera."); el resto va una frase por pregunta.
 */
export function answerAsks(p: PropertyFacts, asks: Ask[]): AnswerSet {
  const sentences: string[] = [];
  const items: AnswerItem[] = [];
  let known = 0;
  let missing = 0;
  const say = (text: string, isKnown: boolean, key: string) => {
    sentences.push(text);
    items.push({ key, known: isKnown });
    if (isKnown) known++;
    else missing++;
  };

  const amenities = asks.filter((a) => a.kind === "amenity" && a.amenity).map((a) => a.amenity!) as Amenity[];
  let amenitiesDone = false;
  for (const ask of asks) {
    switch (ask.kind) {
      case "amenity": {
        if (amenitiesDone) break;
        amenitiesDone = true;
        const r = amenityAnswers(p, amenities);
        sentences.push(...r.sentences);
        items.push(...r.items);
        known += r.known;
        missing += r.missing;
        break;
      }
      case "expenses":
        if (p.price.expenses && p.price.expenses > 0) say(`Las expensas son ${money(p.price.expenses, p.price.currency)}.`, true, "expenses");
        else say("En la publicación no figuran expensas.", false, "expenses");
        break;
      case "area": {
        const parts: string[] = [];
        if (p.coveredArea && p.coveredArea > 0) parts.push(`${n0(p.coveredArea)} m² cubiertos`);
        if (p.totalArea && p.totalArea > 0 && p.totalArea !== p.coveredArea) parts.push(`${n0(p.totalArea)} m² totales`);
        if (parts.length > 0) say(`Tiene ${list(parts)}.`, true, "area");
        else say("En la publicación no figura la superficie.", false, "area");
        break;
      }
      case "rooms":
        if (p.rooms != null) say(`Tiene ${p.rooms} ${plural(p.rooms, "ambiente", "ambientes")}.`, true, "rooms");
        else say("En la publicación no figura la cantidad de ambientes.", false, "rooms");
        break;
      case "bedrooms":
        if (p.bedrooms != null) say(`Tiene ${p.bedrooms} ${plural(p.bedrooms, "dormitorio", "dormitorios")}.`, true, "bedrooms");
        else say("En la publicación no figura la cantidad de dormitorios.", false, "bedrooms");
        break;
      case "bathrooms":
        if (p.bathrooms != null) say(`Tiene ${p.bathrooms} ${plural(p.bathrooms, "baño", "baños")}.`, true, "bathrooms");
        else say("En la publicación no figura la cantidad de baños.", false, "bathrooms");
        break;
      case "age":
        if (p.age != null) say(p.age === 0 ? "Es a estrenar." : `Tiene ${p.age} ${plural(p.age, "año", "años")} de antigüedad.`, true, "age");
        else say("En la publicación no figura la antigüedad.", false, "age");
        break;
      case "floor":
        if (p.floor != null) say(p.floor === 0 ? "Está en planta baja." : `Está en el piso ${p.floor}.`, true, "floor");
        else say("En la publicación no figura el piso.", false, "floor");
        break;
      case "orientation":
        if (p.orientation) say(`Su orientación es ${p.orientation.toLowerCase()}.`, true, "orientation");
        else say("En la publicación no figura la orientación.", false, "orientation");
        break;
      case "place":
        say(`Está en ${placeOf(p)}.`, true, "place");
        break;
      case "tour":
        if (p.hasTour) say("Sí, tiene recorrido 360°: se puede recorrer desde la ficha.", true, "tour");
        else say("Por ahora no tiene recorrido 360° cargado.", false, "tour");
        break;
      case "video":
        if (p.videoCount > 0) say(p.videoCount === 1 ? "Sí, tiene un video en la ficha." : `Sí, tiene ${p.videoCount} videos en la ficha.`, true, "video");
        else say("Por ahora no tiene videos cargados.", false, "video");
        break;
    }
  }
  return { sentences, items, known, missing };
}
