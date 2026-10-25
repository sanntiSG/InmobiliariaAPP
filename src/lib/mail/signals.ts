/**
 * Señales de un mail: qué pide (tipo de propiedad, operación, lugar, plata, ambientes), con qué palabras lo pide (marcos de
 * pedido, preguntas, cortesías) y qué huellas de "no es una consulta" trae (currículums, facturas, ofertas de servicios).
 * Reutiliza el entendimiento del asesor (`advisor/nlu`: vocabulario, raíces, errores de tipeo y entidades), así que "depto",
 * "dpto" y "departamento", o "Ezeiza" mal escrito, se entienden igual. Todo puro: se prueba sin base ni red.
 */
import { list } from "@/lib/advisor/compose/format";
import { extractSlots, type EntityIndex } from "@/lib/advisor/nlu/entities";
import { detectConcepts } from "@/lib/advisor/nlu/lexicon";
import { normalizeText, stripAccents, tokenize } from "@/lib/advisor/nlu/normalize";
import type { Slots } from "@/lib/advisor/types";

// ─── Lo que pide ─────────────────────────────────────────────────────────────

export type SearchSignal = {
  types: string[];
  operation: string | null;
  /** Zonas reconocidas del catálogo de la inmobiliaria. */
  zones: string[];
  /** Nombra un lugar que no está en el catálogo ("zona sur", "cerca de Canning", "en Pilar"). */
  unknownPlace: boolean;
  money: boolean;
  rooms: boolean;
  amenities: boolean;
  /** Cuántas cosas concretas pide (0 a 6): tipo, operación, lugar, plata, ambientes, comodidades. */
  strength: number;
  /** "casas en venta en Ezeiza": sirve para explicar y para redactar. Vacío si no pide nada concreto. */
  label: string;
};

export const NO_SEARCH: SearchSignal = { types: [], operation: null, zones: [], unknownPlace: false, money: false, rooms: false, amenities: false, strength: 0, label: "" };

const EMPTY_INDEX: EntityIndex = { zones: [], properties: [] };

/** Lee el pedido con el vocabulario del asesor. Con el índice del catálogo reconoce zonas y títulos reales. */
export function readRequest(subject: string, text: string, index: EntityIndex = EMPTY_INDEX) {
  const body = `${subject}\n${text}`.slice(0, 2000);
  const norm = normalizeText(body);
  const tokens = tokenize(norm);
  const detected = detectConcepts(tokens);
  const slots = extractSlots(norm, tokens, detected, index);
  return { body, norm, tokens, detected, slots };
}

const PLURAL: Record<string, string> = { casa: "casas", departamento: "departamentos", ph: "PH", terreno: "terrenos", local: "locales", oficina: "oficinas", galpon: "galpones", quinta: "quintas" };

/** Lugares que no están en el catálogo pero se nombran como tales. */
const PLACE_PATTERNS: RegExp[] = [
  /\b(?:zona|barrio|localidad|por)\s+(?:norte|sur|oeste|este|centro)\b/i,
  /\b(?:zona|barrio|localidad|partido)\s+(?:de|del)\s+\p{L}{3,}/iu,
  /\bcerca\s+de\s+\p{L}{3,}/iu,
  /\bpor\s+la\s+zona\b/i,
  /\ben\s+\p{Lu}\p{L}{3,}/u,
];

/** Palabras que confirman cada tipo de propiedad (sin tildes). El vocabulario del asesor tolera errores de tipeo; acá no. */
const TYPE_WORDS: Record<string, RegExp> = {
  casa: /\b(?:casas?|casit[ao]s?|chalets?|casonas?)\b/,
  departamento: /\b(?:departamentos?|deptos?|dptos?|depas?|monoambientes?|duplex|lofts?|pisos?)\b/,
  ph: /\b(?:phs?|p h|propiedad horizontal)\b/,
  terreno: /\b(?:terrenos?|lotes?|loteos?|parcelas?)\b/,
  local: /\b(?:locales?|local comercial|fondo de comercio)\b/,
  oficina: /\b(?:oficinas?|despachos?|coworking)\b/,
  galpon: /\bgalpon(?:es)?\b/,
  quinta: /\b(?:quintas?|chacras?|campos?|countr(?:y|ies)|barrios? (?:cerrados?|privados?))\b/,
};

const OPERATION_WORDS: Record<string, RegExp> = {
  venta: /\b(?:venta|vender|vendo|vendemos|venden|vende|comprar|comprarla|comprarlo|adquirir)\b/,
  alquiler: /\b(?:alquiler(?:es)?|alquilar|alquilo|alquilan|alquila|alquilamos|rentar|renta|arrendar)\b/,
  alquiler_temporal: /\b(?:temporari[oa]s?|temporal(?:es)?|vacaciones|turistic[oa]s?)\b/,
};

/** ¿Habla de plata de verdad (moneda, presupuesto, precio) y no sólo hay un número suelto? */
const MONEY_WORDS = /\b(?:usd|u\$s|us\$|dolares?|pesos|ars|presupuesto|precio|valor|hasta|maximo)\b|\$\s*\d|\d\s*(?:usd|dolares|pesos|mil dolares)/;

export function searchSignal(slots: Slots, body: string): SearchSignal {
  const plain = stripAccents(body.toLowerCase());
  const types = (slots.types ?? []).filter((t) => TYPE_WORDS[t]?.test(plain));
  const operation = slots.operation && OPERATION_WORDS[slots.operation]?.test(plain) ? slots.operation : null;
  const zones = slots.zones ?? [];
  const unknownPlace = zones.length === 0 && PLACE_PATTERNS.some((re) => re.test(body));
  const money = (slots.priceMax != null || slots.priceMin != null) && MONEY_WORDS.test(plain);
  const rooms = slots.rooms != null || slots.bedrooms != null;
  const amenities = (slots.amenities?.length ?? 0) > 0;
  // Un lugar suelto ("nos vemos en Palermo") no es un pedido: cuenta sólo si viene con algo que se busca.
  const concrete = [types.length > 0, operation != null, money, rooms, amenities].filter(Boolean).length;
  const strength = concrete === 0 ? 0 : concrete + (zones.length > 0 || unknownPlace ? 1 : 0);
  if (strength === 0) return NO_SEARCH;

  const noun = types.length > 0 ? list(types.map((t) => PLURAL[t] ?? "propiedades")) : "propiedades";
  const op = operation === "venta" ? " en venta" : operation === "alquiler" ? " en alquiler" : operation === "alquiler_temporal" ? " de alquiler temporal" : "";
  const where = zones.length > 0 ? ` en ${list(zones)}` : "";
  return { types, operation, zones, unknownPlace, money, rooms, amenities, strength, label: `${noun}${op}${where}` };
}

// ─── Con qué palabras lo pide ────────────────────────────────────────────────

export type MailCues = {
  /** Sustantivos del rubro (casa, depto, lote, propiedad, aviso…): 0, 1 o 2 (varios). */
  nouns: number;
  /** Usa un marco de pedido: "busco", "quisiera", "me interesa", "pasame datos", "¿tienen…?". */
  ask: boolean;
  /** Nombra "la propiedad", el inmueble, el aviso o la publicación (palabras que, en una inmobiliaria, hablan de lo que se ofrece). */
  propertyWord: boolean;
  /** Dice que le interesa algo que se ofrece o pide más datos ("me interesa", "estoy interesado", "más info de"): en una inmobiliaria, ya es del rubro. */
  interest: boolean;
  /** Signos de pregunta, hasta 2. */
  questionMarks: number;
  /** Arranca una frase con una palabra interrogativa (aunque falte el signo). */
  interrogative: boolean;
  /** Dice que vio el aviso o nombra un portal. */
  portalCue: boolean;
  /** Saluda o agradece (una persona escribiendo). */
  courtesy: boolean;
  /** Huellas de que NO es una consulta de cliente (currículum, factura, oferta de servicios). */
  offTopic: string | null;
  /** Es un agradecimiento o un cierre ("gracias por la información", "perfecto, gracias"), sin una pregunta nueva. */
  closing: boolean;
  /** El asunto empieza con "Re:": contesta algo que ya se había dicho. */
  replyThread: boolean;
};

const NOUN_RE =
  /\b(?:casas?|casit[ao]s?|chalets?|casonas?|deptos?|dptos?|depas?|departamentos?|monoambientes?|ph|phs|lotes?|terrenos?|locales?|oficinas?|galpon(?:es)?|cocheras?|quintas?|chacras?|campos?|propiedad(?:es)?|inmuebles?|unidad(?:es)?|aviso|avisos|anuncios?|publicacion(?:es)?|fichas?|duplex|loft|pisos?)\b/g;

const ASK_RES: RegExp[] = [
  /\b(?:busc(?:o|amos|ando|ar)|estoy buscando|estamos buscando)\b/,
  /\b(?:necesit(?:o|amos|aria|ariamos)|preciso)\b/,
  /\b(?:quiero|queremos|quisiera|quisieramos|queria|querriamos|me gustaria|nos gustaria|me encantaria)\b/,
  /\b(?:interesad[oa]s?|me interesa(?:n)?|nos interesa(?:n)?|me intereso|estoy interesad[oa]|interesaria)\b/,
  /\b(?:consult(?:o|amos|ar|a)|averigu(?:o|ar|amos)|pregunto|preguntaba|escribo (?:por|para|por la|por el))\b/,
  /\b(?:pas(?:ame|enme|ame|en|as|an|ar)|mand(?:ame|enme|en|as|an|ar)|envi(?:ame|enme|en|as|an|ar)|comparti(?:me|ran))\b.{0,30}\b(?:info|informacion|datos|detalles|fotos|precio|ficha|propiedad|opciones)\b/,
  /\b(?:me|nos)\s+(?:pas(?:an|as|aria|arias|en)|mand(?:an|as|aria|arias|en)|envi(?:an|as|aria|arias|en)|compart(?:en|is|iria))\b/,
  /\b(?:pueden|podrian|podrias|podes|puede|podria|me podrian|me pueden)\b.{0,40}\b(?:decir|pasar|mandar|enviar|informar|contar|confirmar|ayudar|mostrar)\b/,
  /\b(?:tienen|tenes|tienes|tiene|cuentan con|disponen de|manejan|trabajan con)\b/,
  /\b(?:hay|habra)\b.{0,25}\b(?:algo|alguna|alguno|opcion|opciones|disponibilidad|lugar|stock)\b/,
  /\balgun[ao]s? (?:opcion|propiedad|casa|depto|departamento|ph|lote|terreno|local|oficina)/,
  /\b(?:saber|conocer|ver|visitar|coordinar|agendar)\b.{0,40}\b(?:si|cuanto|cuando|cual|como|donde|precio|disponib|propiedad|casa|depto|departamento|ph|lote|terreno|local)\b/,
];

const PROPERTY_WORD_RE = /\b(?:propiedad(?:es)?|inmuebles?|avisos?|anuncios?|publicacion(?:es)?|fichas?|unidad(?:es)?)\b/;

const INTEREST_RE = /\b(?:me|nos) interesa(?:n)?\b|\binteresad[oa]s?\b|\bmas (?:info|informacion|datos|detalles)\b|\b(?:info|informacion|detalles|datos) (?:de|del|sobre|acerca)\b|\bquiero (?:saber|informacion)\b|\bquisiera (?:saber|informacion|mas)\b/;

const INTERROGATIVE_RE = /(?:^|[.!\n]\s*)(?:cuanto|cuanta|cuantos|cuantas|cuando|donde|como|que|cual|cuales|quien|hay|tienen|tiene|sigue|siguen|esta|estan|se puede|puedo|podemos|podria|podrian|incluye|aceptan|acepta)\b/m;

const PORTAL_BRAND_RE = /\b(?:zonaprop|argenprop|mercado ?libre|properati|navent|inmuebles clarin)\b/;
const PORTAL_CUE_RE = /\bvi (?:su|tu|el|la|esta|esa|un|una)\s+(?:aviso|anuncio|publicacion|propiedad|casa|depto|departamento|ph|lote|terreno|local|oficina|ficha)\b|\b(?:encontre|vi) (?:en|por) (?:su|tu|el|la) (?:pagina|sitio|web|portal)\b/;

const COURTESY_RE = /^\s*(?:hola|buen[oa]s?|buenos dias|buenas tardes|buenas noches|que tal|estimad[oa]s?|saludos)\b|\b(?:gracias|muchas gracias|desde ya|quedo atent[oa]|quedamos atent[oa]s|saludos|cordialmente|atte|un abrazo|abrazo)\b/;

/** Huellas de que no es una consulta de un cliente: se descartan salvo que nombre una propiedad o pida algo concreto. */
/** Un agradecimiento o un "ok" cortito: la respuesta a algo que ya se contestó. */
const CLOSING_RE = /^\s*(?:(?:hola|buen[oa]s?(?: dias| tardes| noches)?)[,!. ]*)?(?:muchas |mil )?(?:gracias|agradezco|perfecto|genial|excelente|buenisimo|dale|ok\b|okey|listo|entendido|joya|barbaro|de acuerdo|quedo atent[oa]|muy amable)/;

const OTHER_THINGS_RE = /\b(?:autos?|coche|camioneta|motos?|bicicleta|celular(?:es)?|notebook|computadora|muebles?|heladera|televisor|ropa|zapatillas)\b/;

const OFFTOPIC_RES: [RegExp, string][] = [
  [/\b(?:curriculum|curriculo|\bcv\b|postulacion|postularme|postulo|busqueda laboral|vacante|oferta laboral|puesto de|trabajar con ustedes|pasantia)\b/, "parece una postulación laboral, no una consulta de un cliente"],
  [/\b(?:factura|comprobante de pago|remito|orden de compra|nota de credito|vencimiento de (?:la )?factura|pago pendiente|liquidacion de sueldo)\b/, "parece un trámite o una factura, no una consulta de un cliente"],
  [/\b(?:curso|capacitacion|seminario|webinar|taller|congreso|inscripciones abiertas|cupos limitados|jornada de formacion)\b/, "parece una invitación a un curso o evento, no una consulta de un cliente"],
  [/\b(?:ofrecemos|le ofrecemos|te ofrecemos|nuestros servicios|nuestra empresa|nuestro equipo de ventas|propuesta comercial|cotizacion de servicios|marketing digital|posicionamiento|seo\b|community manager|diseno web|sitio web|agencia de publicidad|publicite)\b/, "parece una oferta de servicios, no una consulta de un cliente"],
];

export function readCues(subject: string, text: string): MailCues {
  const raw = `${subject}\n${text}`;
  const plain = stripAccents(raw.toLowerCase());
  const nounHits = (plain.match(NOUN_RE) ?? []).length;
  // Vender un auto no es una consulta inmobiliaria (sólo si no nombra ninguna propiedad).
  const otherThing = nounHits === 0 && OTHER_THINGS_RE.test(plain) ? "habla de otra cosa, no de una propiedad" : null;
  return {
    nouns: nounHits >= 2 ? 2 : nounHits,
    ask: ASK_RES.some((re) => re.test(plain)),
    interest: INTEREST_RE.test(plain),
    propertyWord: PROPERTY_WORD_RE.test(plain),
    questionMarks: Math.min(2, (raw.match(/[?¿]/g) ?? []).length),
    interrogative: INTERROGATIVE_RE.test(plain),
    portalCue: PORTAL_CUE_RE.test(plain) || (nounHits > 0 && PORTAL_BRAND_RE.test(plain)),
    courtesy: COURTESY_RE.test(plain),
    offTopic: OFFTOPIC_RES.find(([re]) => re.test(plain))?.[1] ?? otherThing,
    replyThread: /^\s*(?:re|rv)\s*:/i.test(subject),
    closing: plain.trim().length <= 220 && !/[?¿]/.test(raw) && CLOSING_RE.test(plain.replace(/^\s*\S[^\n]{0,59}\n/, (m) => (CLOSING_RE.test(m) ? m : ""))),
  };
}
