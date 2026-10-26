/**
 * Entiende de qué trata un mail: ¿es una consulta por una propiedad? ¿qué pregunta (disponibilidad, precio, características,
 * visita)? ¿hay algo que el agente no puede contestar solo (financiación, permuta, mascotas, un reclamo…)? Son reglas con
 * pesos —las mismas ideas que el asesor usa para las preguntas—, sin IA: se puede explicar cada decisión ("por qué lo
 * detecté") y probar con mails de ejemplo. Función pura sobre el texto ya limpio.
 *
 * El puntaje se arma con EVIDENCIA acumulada (una propiedad nombrada, lo que pide —tipo, operación, lugar, plata—, cómo lo pide
 * —marcos de pedido, preguntas—, palabras del rubro, un portal) y no sólo con frases hechas: así se entiende "Casas en venta en
 * Ezeiza" aunque no tenga un verbo. Hay tres salidas: consulta clara, "quizás es una consulta" (una persona con algo del
 * rubro: se deja para que la revise alguien, nunca se tira) y "no es una consulta".
 */
import { stripAccents } from "@/lib/advisor/nlu/normalize";
import { INQUIRY_CATEGORIES, type MailCategory } from "./constants";
import { readCues, readRequest, searchSignal, type SearchSignal } from "./signals";

export type Classification = {
  category: MailCategory;
  /** Qué tan seguro está (0 a 1). El modo automático exige 0,75 o más. */
  confidence: number;
  /** Por qué lo clasificó así, en palabras. */
  reasons: string[];
  /** Todos los temas que toca, de más a menos importante ("precio" + "visita"). Sólo categorías de consulta. */
  topics: MailCategory[];
  /** Algo que una persona tiene que contestar. */
  needsHuman: boolean;
  humanTopics: string[];
  /** Parece una consulta pero no está seguro de qué necesita: se arma un borrador para que lo revise una persona. */
  uncertain: boolean;
};

type Rule = { re: RegExp; cat: MailCategory; w: number; why: string };

const PROPERTY_WORDS = "casa|casas|depto|deptos|dpto|dptos|departamento|departamentos|ph|lote|lotes|terreno|terrenos|local|locales|oficina|oficinas|propiedad|propiedades|inmueble|cochera|quinta|galpon";

const RULES: Rule[] = [
  // Disponibilidad
  { re: /\b(sigue|siguen|continua|continuan|todavia|aun|ya)\b.{0,40}\b(disponible|disponibles|en venta|en alquiler|libre|libres|vigente|vigentes|publicad[oa]s?|en pie)\b/, cat: "availability", w: 3, why: "pregunta si sigue disponible" },
  { re: new RegExp(`\\b(sigue|siguen)\\b.{0,25}\\b(${PROPERTY_WORDS})\\b|\\b(${PROPERTY_WORDS})\\b.{0,25}\\b(sigue|siguen)\\b`), cat: "availability", w: 2, why: "pregunta si la propiedad sigue" },
  { re: /\bdisponib\w*/, cat: "availability", w: 2, why: "menciona la disponibilidad" },
  { re: /\b(esta|estan|sigue|siguen) (en venta|en alquiler|libre|libres|disponible|disponibles)\b/, cat: "availability", w: 3, why: "pregunta si sigue en venta o en alquiler" },
  { re: /\bse (alquila|vende|alquilan|venden)\b/, cat: "availability", w: 2, why: "pregunta si se alquila o se vende" },
  { re: /\bya (se )?(alquilo|vendio|alquilaron|vendieron|reservo|reservaron)\b/, cat: "availability", w: 3, why: "pregunta si ya se alquiló o se vendió" },
  // Precio
  { re: /\b(precio|valor|costo|cotizacion)\b/, cat: "price", w: 3, why: "pregunta por el precio" },
  { re: /\bcuanto (sale|salen|cuesta|cuestan|es|son|vale|valen|piden|se pide|cobran|hay que pagar|esta|estan|pagan)\b/, cat: "price", w: 3, why: "pregunta cuánto cuesta" },
  { re: /\b(a|en|por) cuanto\b/, cat: "price", w: 3, why: "pregunta cuánto cuesta" },
  { re: /\b(precios?|valores)\b/, cat: "price", w: 3, why: "pregunta por el precio" },
  { re: /\b(expensas|abl|impuestos|gastos)\b/, cat: "price", w: 2, why: "pregunta por expensas o gastos" },
  { re: /\b\d[\d.,]*\s*(usd|u\$s|us\$|dolares|pesos|ars|k)\b|\b(usd|u\$s|us\$)\s*\d/, cat: "price", w: 1.5, why: "habla de plata" },
  { re: /\bpresupuesto\b/, cat: "general", w: 1.5, why: "cuenta su presupuesto" },
  // Características
  { re: /\b(ambientes?|dormitorios?|habitaciones?|banos?|cochera|garage|balcon|terraza|patio|jardin|pileta|piscina|quincho|parrilla|ascensor|baulera|amoblad[oa]|luminos[oa]|orientacion|antiguedad|superficie|m2|metros|cubiert[oa]s?|calefaccion|aire acondicionado|gas natural|apto profesional|mascotas)\b/, cat: "features", w: 1.5, why: "pregunta por las características" },
  { re: /\b(cuantos|cuantas|tiene|cuenta con|incluye|viene con)\b/, cat: "features", w: 1, why: "pregunta qué incluye" },
  // Visita
  { re: /\b(visitar(l[aeo]s?)?|visitas?|conocer(l[aeo]s?)?|ver (la|el) (propiedad|casa|departamento|depto|lugar|inmueble)|verl[aeo]s?|mostrar(l[aeo]s?|me)|coordinar|agendar|turno|ir a verl[aeo]s?|pasar a ver)\b/, cat: "visit", w: 3, why: "quiere visitarla" },
  { re: /\bcuando (puedo|podemos|podria|podriamos|se puede) (ir|verla|verlo|visitar|pasar|conocer)\b/, cat: "visit", w: 3, why: "pregunta cuándo puede ir" },
  { re: /\bhorarios? de (visita|atencion)\b/, cat: "visit", w: 2, why: "pregunta por horarios" },
  // Consulta general
  { re: /\b(consulta|consultar|consulto|informacion|info|informes?|interesad[oa]|me interesa|me gustaria|quisiera|queria saber|necesito saber|quiero saber)\b/, cat: "general", w: 1.5, why: "pide información" },
  { re: /\b(tienen|tenes|tienes|hay|busco|buscando|estoy buscando|necesito|quiero|quisiera|queremos|buscamos)\b.{0,40}\b(departamentos?|deptos?|dptos?|casas?|ph|locales?|oficinas?|terrenos?|lotes?|quintas?|propiedades|alquileres|en venta|en alquiler)\b/, cat: "general", w: 2, why: "busca una propiedad" },
  // No son consultas
  { re: /\b(darse de baja|desuscrib\w+|unsubscribe|newsletter)\b/, cat: "newsletter", w: 4, why: "tiene un enlace para darse de baja (lista de correo)" },
  { re: /\b(oferta imperdible|descuentos? exclusiv\w+|promocion\w*|ofertas? de la semana|aprovecha (la|esta) oferta)\b/, cat: "newsletter", w: 2, why: "tiene señales de promoción" },
  { re: /\b(ganaste|has ganado|premio|loteria|herencia|bitcoin|criptomonedas?|inversion garantizada|transferencia urgente|verifica tu cuenta|cuenta suspendida|prestamo (rapido|inmediato)|viagra)\b/, cat: "spam", w: 4, why: "tiene señales de basura o de engaño" },
  { re: /\b(clic aqui|click aqui|haga clic|hace clic|ingresa aqui)\b/, cat: "spam", w: 2, why: "te pide hacer clic en un enlace" },
  { re: /\b(delivery status notification|undeliverable|mail delivery (failed|subsystem)|no se pudo entregar|entrega fallida|returned mail)\b/, cat: "bounce", w: 5, why: "es un aviso de entrega fallida" },
  { re: /\b(fuera de (la )?oficina|respuesta automatica|out of office|auto-?reply|no responder este (mensaje|correo))\b/, cat: "automated", w: 4, why: "es una respuesta automática" },
];

/** Quien escribe quiere VENDER (o tasar) una propiedad suya: es un contacto valioso, pero no hay nada del catálogo para ofrecerle. */
export const SELLER_TOPIC = "tasación o venta de su propiedad";

// Cosas que el agente NO puede contestar por su cuenta: avisa y deja que lo vea una persona.
const HUMAN: { re: RegExp; topic: string }[] = [
  // "banco" solo no es financiación ("trabajo en un banco"): cuenta si habla de crédito, hipoteca o préstamo.
  { re: /\b(financi\w+|credito|hipotecari\w+|prestamo)\b|\bbanco\b.{0,40}\b(hipoteca|aprobad\w+|preaprobad\w+|cuotas)\b/, topic: "financiación" },
  { re: /\b(permut\w+|canje)\b/, topic: "permuta" },
  // Con límites de palabra en las tres opciones: un apellido como "Pegatos" no son mascotas.
  { re: /\b(?:mascotas?|perros?|gatos?)\b/, topic: "mascotas" },
  { re: /\b(garantia|garante|seguro de caucion|recibo de sueldo|requisitos)\b/, topic: "requisitos del alquiler" },
  { re: /\b(escritura|escriturar|boleto|comision|honorarios)\b/, topic: "escritura o comisión" },
  // "oferta de departamentos" es otra cosa: negociar es hacer una oferta/contraoferta o ofrecer un monto.
  { re: /\b(negociable|negociar|rebaja|mejor precio|hacer(?:les|le)? una oferta|una contraoferta|contraoferta|ofertar|oferto|ofrezco)\b|\boferta de (?:usd|u\$s|us\$|\$|\d)/, topic: "negociación del precio" },
  { re: /\b(reclamo|queja|denuncia|abogado|demanda|estafa)\b/, topic: "un reclamo" },
  { re: /\b(tasacion|tasar\w*|tasen|vender mi|vender mis|quiero vender|queremos vender|para vender|vendo mi|vendo una|publicar mi|ofrecer mi|ofrecerles mi)\b/, topic: SELLER_TOPIC },
];

const FEATURE_CAP = 4.5;
const PRIORITY: MailCategory[] = ["visit", "price", "availability", "features", "general"];

/** Desde cuántos puntos de evidencia es una consulta clara. */
export const INQUIRY_MIN = 3;
/** Desde cuántos, con algo del rubro, "quizás es una consulta" (se deja para revisar en vez de descartarla). */
export const REVIEW_MIN = 1.5;

export const UNSURE_REASON = "Creo que es una consulta, pero no estoy seguro de qué necesita: revisala.";

export function classifyMail(input: {
  subject: string;
  text: string;
  /** Nombra una de las propiedades (enlace o título). */
  hasPropertyRef: boolean;
  /** Lo que pide ("departamentos en Palermo") coincide con propiedades del catálogo. */
  searchHits?: boolean;
  portal?: boolean;
  /** Lo que pide (tipo, operación, lugar…), ya leído con el catálogo; si falta se lee del texto sin el catálogo. */
  search?: SearchSignal;
}): Classification {
  const body = `${input.subject}\n${input.text}`;
  const plain = stripAccents(body.toLowerCase());
  const search = input.search ?? searchSignal(readRequest(input.subject, input.text).slots, body);
  const cues = readCues(input.subject, input.text);

  const scores = new Map<MailCategory, number>();
  const why = new Map<MailCategory, string[]>();
  for (const r of RULES) {
    if (!r.re.test(plain)) continue;
    const next = (scores.get(r.cat) ?? 0) + r.w;
    scores.set(r.cat, r.cat === "features" ? Math.min(next, FEATURE_CAP) : next);
    const list = why.get(r.cat) ?? [];
    if (!list.includes(r.why)) list.push(r.why);
    why.set(r.cat, list);
  }

  const humanTopics = [...new Set(HUMAN.filter((h) => h.re.test(plain)).map((h) => h.topic))];

  // ¿Alguna categoría que no es consulta le gana a las consultas?
  const nonInquiry = (["bounce", "automated", "spam", "newsletter"] as MailCategory[])
    .map((c) => [c, scores.get(c) ?? 0] as const)
    .sort((a, b) => b[1] - a[1])[0]!;
  const inquiryScores = INQUIRY_CATEGORIES.map((c) => [c, scores.get(c) ?? 0] as const);
  const bestInquiry = [...inquiryScores].sort((a, b) => b[1] - a[1] || PRIORITY.indexOf(a[0]) - PRIORITY.indexOf(b[0]))[0]!;

  // Evidencia: lo que nombra, lo que pide y cómo lo pide.
  const searchPts = search.strength >= 3 ? 4 : search.strength === 2 ? 3.5 : search.strength === 1 ? (cues.ask || cues.questionMarks > 0 ? 3 : 0.5) : 0;
  const nounPts = cues.nouns === 0 ? 0 : cues.nouns === 1 ? 1 : 1.5;
  const questionPts = Math.min(1, cues.questionMarks * 0.5) + (cues.interrogative && cues.questionMarks === 0 ? 0.5 : 0);
  const evidence =
    (input.hasPropertyRef ? 3.5 : 0) + searchPts + (input.searchHits ? 1 : 0) + (cues.ask ? 1.5 : 0) + nounPts + questionPts + (input.portal ? 2 : 0) + (cues.portalCue ? 1.5 : 0);
  const topicPts = bestInquiry[1];
  const raw = topicPts + evidence;
  const inquiryScore = raw > 0 && cues.courtesy ? raw + 0.5 : raw;

  const topics = inquiryScores
    .filter(([, s]) => s >= 2)
    .sort((a, b) => b[1] - a[1] || PRIORITY.indexOf(a[0]) - PRIORITY.indexOf(b[0]))
    .map(([c]) => c);
  const base = { topics, needsHuman: humanTopics.length > 0, humanTopics, uncertain: false };

  if (nonInquiry[1] >= 4 && nonInquiry[1] >= inquiryScore) {
    return { ...base, topics: [], needsHuman: false, humanTopics: [], category: nonInquiry[0], confidence: Math.min(0.95, 0.6 + 0.07 * nonInquiry[1]), reasons: why.get(nonInquiry[0]) ?? [] };
  }

  // Un trámite, una factura o una oferta de servicios no es una consulta (salvo que nombre una propiedad o pida algo concreto).
  if (cues.offTopic && !input.hasPropertyRef && search.strength < 2) {
    return { ...base, topics: [], needsHuman: false, humanTopics: [], category: "other", confidence: 0.8, reasons: [cues.offTopic] };
  }

  // Un agradecimiento o un "ok" no abre una consulta nueva.
  if (cues.closing && (cues.replyThread || (!input.hasPropertyRef && search.strength < 2))) {
    return { ...base, topics: [], needsHuman: false, humanTopics: [], category: "other", confidence: 0.8, reasons: ["es un agradecimiento o un cierre, no una consulta nueva"] };
  }

  // ¿Hay algo del rubro? Una propiedad, un pedido concreto, una pista de portal o un tema de verdad (disponibilidad, precio,
  // visita, características); "expensas" o "consulta" sueltas, no.
  const strongTopic = (scores.get("availability") ?? 0) >= 2 || (scores.get("price") ?? 0) >= 3 || (scores.get("visit") ?? 0) >= 2 || (scores.get("features") ?? 0) >= 2.5;
  const domain = cues.nouns > 0 || search.strength > 0 || cues.portalCue || cues.interest || input.hasPropertyRef || !!input.portal || strongTopic;
  if (!domain) {
    return { ...base, topics: [], needsHuman: false, humanTopics: [], category: "other", confidence: 0.7, reasons: ["no nombra una propiedad ni pide nada del rubro inmobiliario"] };
  }

  const reasonsFor = (): string[] => {
    const reasons = [...(why.get(bestInquiry[0]) ?? [])];
    if (search.strength > 0 && search.label) reasons.push(`busca ${search.label}`);
    if (input.hasPropertyRef) reasons.push("nombra una de tus propiedades");
    else if (input.searchHits) reasons.push("pide algo que tenés publicado");
    if (input.portal || cues.portalCue) reasons.push("llegó por un portal inmobiliario o vio tu aviso");
    if (reasons.length === 0 && cues.ask) reasons.push("pide información");
    return reasons;
  };

  if (inquiryScore >= INQUIRY_MIN) {
    const category = topicPts > 0 ? bestInquiry[0] : "general";
    return { ...base, topics: topics.length > 0 ? topics : [category], category, confidence: Math.min(0.97, 0.4 + 0.06 * inquiryScore), reasons: reasonsFor().length > 0 ? reasonsFor() : ["parece una consulta por una propiedad"] };
  }

  // Una persona con algo del rubro que PIDE o PREGUNTA algo: nunca se tira, se deja para que la revise alguien. Una mención suelta
  // ("papeles de la oficina", "te invito a mi casa") no es un pedido.
  const requestish = cues.propertyWord || cues.ask || cues.questionMarks > 0 || cues.interrogative || cues.interest || strongTopic || cues.portalCue || !!input.portal || input.hasPropertyRef || search.strength >= 2;
  if (inquiryScore >= REVIEW_MIN && requestish) {
    return {
      ...base,
      topics: ["general"],
      needsHuman: true,
      uncertain: true,
      category: "general",
      confidence: Math.min(0.5, 0.3 + 0.07 * inquiryScore),
      reasons: [UNSURE_REASON, ...reasonsFor()],
    };
  }

  return { ...base, topics: [], needsHuman: false, humanTopics: [], category: "other", confidence: 0.7, reasons: ["no nombra una propiedad ni pide nada del rubro inmobiliario"] };
}

/** ¿Tiene sentido armarle una respuesta? (las consultas claras y las dudosas). */
export const shouldReply = (c: Classification): boolean => INQUIRY_CATEGORIES.includes(c.category);

