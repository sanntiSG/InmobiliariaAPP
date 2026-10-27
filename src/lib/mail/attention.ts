/**
 * Cuándo un mail necesita a una persona del equipo y cómo se le avisa. Ningún cliente se queda sin seguimiento: si el agente no
 * entendió algo, prometió "te lo confirmamos a la brevedad", la publicación no tenía un dato que se preguntó, o quien escribe
 * contestó un mail automático (posiblemente quiere hablar con una persona), se deja una notificación que abre justo esa
 * conversación. Funciones puras (sin base de datos).
 */
import { list } from "@/lib/advisor/compose/format";

/** El pie de las respuestas automáticas (`compose.ts`): si viene citado en un mail, esa persona está contestando uno nuestro. */
const AUTO_FOOTER = /preparada por un asistente autom[aá]tico/i;

/** ¿El texto (sin limpiar) cita el pie de una respuesta automática nuestra? Sirve cuando el mail no trae encabezados de hilo. */
export const quotesAutoFooter = (rawText: string): boolean => AUTO_FOOTER.test(rawText);

/** Un agradecimiento o un "ok" a una respuesta automática no necesita a nadie: se ignora como siempre. */
export const isClosingReason = (reasons: readonly string[]): boolean => reasons.some((r) => r.startsWith("es un agradecimiento o un cierre"));

export const REPLIED_TO_AUTO_REASON = "Contestó a un mail automático de la inmobiliaria: posiblemente quiere hablar con una persona.";

export type AttentionInput = {
  repliedToAuto: boolean;
  /** El agente no estuvo seguro de qué necesita. */
  uncertain: boolean;
  /** Temas concretos que lo necesitan ("mascotas", "financiación"…). */
  humanTopics: readonly string[];
  /** Preguntas que la publicación no podía contestar ("no figura"). */
  missing: number;
  /** La respuesta ya salió sola (con lo que se sabía). */
  autoSent: boolean;
  /** Hay un borrador esperando que alguien lo confirme. */
  awaiting: boolean;
  /** Quién escribió y el asunto, para reconocerlo en la lista. */
  who: string;
  subject: string;
};

export type Attention = { title: string; body: string };

/** ¿Este mail deja algo pendiente para una persona? */
export const needsAttention = (i: Pick<AttentionInput, "repliedToAuto" | "uncertain" | "humanTopics" | "missing">): boolean =>
  i.repliedToAuto || i.uncertain || i.humanTopics.length > 0 || i.missing > 0;

/**
 * El texto de la notificación, o `null` si no hay nada pendiente. Siempre dice qué pasó y qué se espera de la persona; nunca
 * copia el contenido del mail (sólo quién escribió y el asunto, acotados).
 */
export function attentionNotice(i: AttentionInput): Attention | null {
  if (!needsAttention(i)) return null;
  const what = [
    ...(i.humanTopics.length > 0 ? [`sobre ${list([...i.humanTopics])}`] : []),
    ...(i.missing > 0 ? ["algo que la publicación no tiene cargado"] : []),
  ];
  const next = i.autoSent ? " Ya se le respondió con lo que se sabía: falta lo demás." : i.awaiting ? " Hay una respuesta para confirmar." : "";
  const who = `${i.who || "Un cliente"}: ${i.subject || "sin asunto"}`;

  let title: string;
  let lead: string;
  if (i.repliedToAuto) {
    title = "Un cliente respondió a un correo automático.";
    lead = "Posiblemente quiere hablar con una persona.";
  } else if (i.uncertain) {
    title = "No supe bien qué necesita un cliente.";
    lead = "Revisá su mail y respondele.";
  } else if (i.humanTopics.length > 0) {
    title = "Un cliente tiene una duda para una persona.";
    lead = `Pregunta ${what.join(" y ")}.`;
  } else {
    title = "Un cliente preguntó algo que la publicación no tiene.";
    lead = "Confirmá el dato y contestale.";
  }
  return { title, body: `${lead}${next} ${who}`.slice(0, 200) };
}
