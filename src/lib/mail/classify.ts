/**
 * Entiende de qué trata un mail: ¿es una consulta por una propiedad? ¿qué pregunta (disponibilidad, precio, características,
 * visita)? ¿hay algo que el agente no puede contestar solo (financiación, permuta, mascotas, un reclamo…)? Son reglas con
 * pesos —las mismas ideas que el asesor usa para las preguntas—, sin IA: se puede explicar cada decisión ("por qué lo
 * detecté") y probar con mails de ejemplo. Función pura sobre el texto ya limpio.
 */
import { stripAccents } from "@/lib/advisor/nlu/normalize";
import { INQUIRY_CATEGORIES, isInquiry, type MailCategory } from "./constants";

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
};

type Rule = { re: RegExp; cat: MailCategory; w: number; why: string };

const RULES: Rule[] = [
  // Disponibilidad
  { re: /\b(sigue|continua|todavia|aun)\b.{0,30}\b(disponible|en venta|en alquiler|libre|vigente|publicad[oa])\b/, cat: "availability", w: 3, why: "pregunta si sigue disponible" },
  { re: /\bdisponib\w*/, cat: "availability", w: 2, why: "menciona la disponibilidad" },
  { re: /\b(esta|sigue) (en venta|en alquiler|libre)\b/, cat: "availability", w: 3, why: "pregunta si sigue en venta o en alquiler" },
  { re: /\bse (alquila|vende)\b/, cat: "availability", w: 2, why: "pregunta si se alquila o se vende" },
  // Precio
  { re: /\b(precio|valor|costo|cotizacion)\b/, cat: "price", w: 3, why: "pregunta por el precio" },
  { re: /\bcuanto (sale|salen|cuesta|cuestan|es|son|vale|valen|piden|se pide|cobran|hay que pagar)\b/, cat: "price", w: 3, why: "pregunta cuánto cuesta" },
  { re: /\b(precios?|valores)\b/, cat: "price", w: 3, why: "pregunta por el precio" },
  { re: /\b(expensas|abl|impuestos|gastos)\b/, cat: "price", w: 2, why: "pregunta por expensas o gastos" },
  // Características
  { re: /\b(ambientes?|dormitorios?|habitaciones?|banos?|cochera|garage|balcon|terraza|patio|jardin|pileta|piscina|quincho|parrilla|ascensor|baulera|amoblad[oa]|luminos[oa]|orientacion|antiguedad|superficie|m2|metros|cubiert[oa]s?|calefaccion|aire acondicionado|gas natural|apto profesional)\b/, cat: "features", w: 1.5, why: "pregunta por las características" },
  { re: /\b(cuantos|cuantas|tiene|cuenta con|incluye|viene con)\b/, cat: "features", w: 1, why: "pregunta qué incluye" },
  // Visita
  { re: /\b(visitar(l[aeo]s?)?|visitas?|conocer(l[aeo]s?)?|ver (la|el) (propiedad|casa|departamento|depto|lugar|inmueble)|coordinar|agendar|turno|ir a verl[aeo]s?)\b/, cat: "visit", w: 3, why: "quiere visitarla" },
  { re: /\bcuando (puedo|podemos|podria|se puede) (ir|verla|verlo|visitar|pasar)\b/, cat: "visit", w: 3, why: "pregunta cuándo puede ir" },
  { re: /\bhorarios? de (visita|atencion)\b/, cat: "visit", w: 2, why: "pregunta por horarios" },
  // Consulta general
  { re: /\b(consulta|consultar|informacion|info|interesad[oa]|me interesa|me gustaria|quisiera|queria saber|necesito saber)\b/, cat: "general", w: 1.5, why: "pide información" },
  { re: /\b(tienen|tenes|tienes|hay|busco|buscando|estoy buscando|necesito|quiero|quisiera)\b.{0,40}\b(departamentos?|deptos?|dptos?|casas?|ph|locales?|oficinas?|terrenos?|lotes?|quintas?|propiedades|alquileres|en venta|en alquiler)\b/, cat: "general", w: 2, why: "busca una propiedad" },
  // No son consultas
  { re: /\b(darse de baja|desuscrib\w+|unsubscribe|newsletter)\b/, cat: "newsletter", w: 4, why: "tiene un enlace para darse de baja (lista de correo)" },
  { re: /\b(oferta imperdible|descuentos? exclusiv\w+|promocion\w*|ofertas? de la semana)\b/, cat: "newsletter", w: 2, why: "tiene señales de promoción" },
  { re: /\b(ganaste|has ganado|premio|loteria|herencia|bitcoin|criptomonedas?|inversion garantizada|transferencia urgente|verifica tu cuenta|cuenta suspendida|prestamo (rapido|inmediato)|viagra)\b/, cat: "spam", w: 4, why: "tiene señales de basura o de engaño" },
  { re: /\b(clic aqui|click aqui|haga clic|hace clic|ingresa aqui)\b/, cat: "spam", w: 2, why: "te pide hacer clic en un enlace" },
  { re: /\b(delivery status notification|undeliverable|mail delivery (failed|subsystem)|no se pudo entregar|entrega fallida|returned mail)\b/, cat: "bounce", w: 5, why: "es un aviso de entrega fallida" },
  { re: /\b(fuera de (la )?oficina|respuesta automatica|out of office|auto-?reply|no responder este (mensaje|correo))\b/, cat: "automated", w: 4, why: "es una respuesta automática" },
];

// Cosas que el agente NO puede contestar por su cuenta: avisa y deja que lo vea una persona.
const HUMAN: { re: RegExp; topic: string }[] = [
  { re: /\b(financi\w+|credito|hipotecari\w+|prestamo|banco)\b/, topic: "financiación" },
  { re: /\b(permut\w+|canje)\b/, topic: "permuta" },
  { re: /\bmascotas?|perros?|gatos?\b/, topic: "mascotas" },
  { re: /\b(garantia|garante|seguro de caucion|recibo de sueldo|requisitos)\b/, topic: "requisitos del alquiler" },
  { re: /\b(escritura|escriturar|boleto|comision|honorarios)\b/, topic: "escritura o comisión" },
  { re: /\b(negociable|negociar|rebaja|mejor precio|hacer una oferta|oferta de)\b/, topic: "negociación del precio" },
  { re: /\b(reclamo|queja|denuncia|abogado|demanda|estafa)\b/, topic: "un reclamo" },
  { re: /\b(tasacion|tasar|vender mi|quiero vender|publicar mi)\b/, topic: "tasación o venta de su propiedad" },
];

const FEATURE_CAP = 4.5;
const PRIORITY: MailCategory[] = ["visit", "price", "availability", "features", "general"];

export function classifyMail(input: {
  subject: string;
  text: string;
  /** Nombra una de las propiedades (enlace o título). */
  hasPropertyRef: boolean;
  /** Lo que pide ("departamentos en Palermo") coincide con propiedades del catálogo. */
  searchHits?: boolean;
  portal?: boolean;
}): Classification {
  const plain = stripAccents(`${input.subject}\n${input.text}`.toLowerCase());
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

  const questions = Math.min(2, (input.text.match(/[?¿]/g) ?? []).length);
  const bonus = (input.hasPropertyRef ? 2 : 0) + (input.searchHits ? 1.5 : 0) + (input.portal ? 2 : 0) + questions * 0.5;
  const inquiryScore = bestInquiry[1] > 0 ? bestInquiry[1] + bonus : 0;
  const topics = inquiryScores
    .filter(([, s]) => s >= 2)
    .sort((a, b) => b[1] - a[1] || PRIORITY.indexOf(a[0]) - PRIORITY.indexOf(b[0]))
    .map(([c]) => c);
  const base = { topics, needsHuman: humanTopics.length > 0, humanTopics };

  if (nonInquiry[1] >= 4 && nonInquiry[1] >= inquiryScore) {
    return { ...base, topics: [], needsHuman: false, humanTopics: [], category: nonInquiry[0], confidence: Math.min(0.95, 0.6 + 0.07 * nonInquiry[1]), reasons: why.get(nonInquiry[0]) ?? [] };
  }
  if (inquiryScore >= 3) {
    const reasons = [...(why.get(bestInquiry[0]) ?? [])];
    if (input.hasPropertyRef) reasons.push("nombra una de tus propiedades");
    else if (input.searchHits) reasons.push("pide algo que tenés publicado");
    if (input.portal) reasons.push("llegó por un portal inmobiliario");
    // Más señales distintas = más seguridad; los temas que toca ayudan a redactar.
    return { ...base, category: bestInquiry[0], confidence: Math.min(0.97, 0.4 + 0.06 * inquiryScore), reasons };
  }
  const text = input.text.trim();
  if ((input.hasPropertyRef && text.length > 20) || input.portal) {
    return { ...base, topics: topics.length > 0 ? topics : ["general"], category: "general", confidence: 0.55, reasons: ["menciona una propiedad, pero no se entiende bien qué pregunta"] };
  }
  return { ...base, topics: [], needsHuman: false, humanTopics: [], category: "other", confidence: 0.7, reasons: ["no parece una consulta por una propiedad"] };
}

/** ¿Tiene sentido armarle una respuesta? (sólo las consultas). */
export const shouldReply = (c: Classification): boolean => isInquiry(c.category);
