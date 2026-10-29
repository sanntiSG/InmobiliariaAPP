/**
 * Vocabulario del agente de correo, compartido por el servidor, los modelos y las pantallas (sin base de datos).
 */

/** Tipos de mail que el agente reconoce. Los cinco primeros son consultas; el resto, no. */
export const MAIL_CATEGORIES = [
  "availability", // "¿sigue disponible?"
  "price", // "¿cuánto sale?", "¿se puede negociar?"
  "features", // "¿tiene cochera?", "¿cuántos ambientes?"
  "visit", // "¿puedo ir a verla?"
  "general", // consulta sobre una propiedad sin un pedido puntual
  "automated", // respuestas automáticas, fuera de oficina, confirmaciones
  "newsletter", // listas y promociones
  "bounce", // rebotes del servidor de correo
  "spam", // basura o intento de engaño
  "other", // no es una consulta de propiedades
] as const;
export type MailCategory = (typeof MAIL_CATEGORIES)[number];

export const INQUIRY_CATEGORIES: readonly MailCategory[] = ["availability", "price", "features", "visit", "general"];
export const isInquiry = (c: MailCategory): boolean => INQUIRY_CATEGORIES.includes(c);

export const MAIL_CATEGORY_LABELS: Record<MailCategory, string> = {
  availability: "Pregunta si sigue disponible",
  price: "Pregunta por el precio",
  features: "Pregunta por las características",
  visit: "Quiere visitarla",
  general: "Consulta general",
  automated: "Respuesta automática",
  newsletter: "Promoción o lista de correo",
  bounce: "Rebote del servidor",
  spam: "Posible basura",
  other: "No es una consulta",
};

/**
 * Por qué una respuesta NO salió sola (queda en "Para confirmar"). Antes sólo existía como una frase suelta dentro de los motivos;
 * ahora se guarda como código y la pantalla lo muestra sin tener que leer texto. `none` = salió sola.
 */
export const HOLD_CODES = [
  "confirm_mode", // el agente está en modo confirmación
  "category_off", // ese tipo de consulta siempre se confirma
  "low_confidence", // no estaba del todo seguro de qué preguntaba
  "replied_to_auto", // contestó un mail automático nuestro
  "human_hard", // hay algo que debe contestar una persona (reclamo, negociar, permuta…)
  "inherited", // no nombró la propiedad: se retomó la de su consulta anterior
  "auth_failed", // el remitente no pasó las verificaciones del correo
  "reply_elsewhere", // pide que se responda a otra dirección
  "no_property", // no se identificó de qué propiedad habla
  "searches_off", // pide algo general y las respuestas automáticas a búsquedas están apagadas
  "no_match", // pide algo que no hay publicado
  "off_schedule", // fuera del horario automático
  "daily_cap", // tope diario de respuestas automáticas
  "sender_cap", // tope de respuestas a esa persona por día
  "thread_answered", // ya se respondió en esa conversación
] as const;
export type HoldCode = (typeof HOLD_CODES)[number];

export const HOLD_LABELS: Record<HoldCode, string> = {
  confirm_mode: "Modo confirmación",
  category_off: "Este tipo se confirma siempre",
  low_confidence: "El agente dudó",
  replied_to_auto: "Contestó a un mail automático",
  human_hard: "Lo tiene que ver una persona",
  inherited: "Retomó su consulta anterior",
  auth_failed: "Remitente sin verificar",
  reply_elsewhere: "Pide otra dirección de respuesta",
  no_property: "No se supo de qué propiedad habla",
  searches_off: "Búsqueda general",
  no_match: "Pide algo que no hay publicado",
  off_schedule: "Fuera de horario",
  daily_cap: "Tope diario",
  sender_cap: "Tope por persona",
  thread_answered: "Ya se respondió",
};

/** Qué pasó con cada pregunta puntual de un mail: `answered` = la publicación tenía el dato; `missing` = el dato no está cargado; `human` = la contesta una persona. */
export const ASK_STATES = ["answered", "missing", "human"] as const;
export type AskState = (typeof ASK_STATES)[number];

export const MAIL_MESSAGE_STATUSES = ["ignored", "awaiting_confirmation", "queued", "sending", "sent", "discarded", "failed"] as const;
export type MailMessageStatus = (typeof MAIL_MESSAGE_STATUSES)[number];

export const MAIL_STATUS_LABELS: Record<MailMessageStatus, string> = {
  ignored: "Ignorado",
  awaiting_confirmation: "Para confirmar",
  queued: "En cola para enviar",
  sending: "Enviando",
  sent: "Enviado",
  discarded: "Descartado",
  failed: "No se pudo enviar",
};

export const MAILBOX_STATUSES = ["active", "auth_failed", "error", "paused"] as const;
export type MailboxStatus = (typeof MAILBOX_STATUSES)[number];

export const MAIL_MODES = ["confirm", "auto"] as const;
export type MailMode = (typeof MAIL_MODES)[number];

/** Topes de seguridad (se aplican en el servidor aunque la pantalla pida otra cosa). */
export const MAIL_LIMITS = {
  /** Mails nuevos que se procesan por revisión (el resto queda para la siguiente). */
  perPoll: 15,
  /** Peso máximo de lo que se baja de cada mail (sin adjuntos). */
  maxBytes: 64 * 1024,
  /** Largo del texto limpio que se guarda. */
  maxText: 8000,
  autoPerDayMax: 100,
  autoPerDayDefault: 20,
  /** Respuestas automáticas a la misma persona por día. */
  autoPerSenderMax: 10,
  autoPerSenderDefault: 3,
  /** Días que se conserva un mail (a los 14 si se ignoró). */
  retentionDays: 60,
  retentionIgnoredDays: 14,
  maxPropertiesMin: 1,
  maxPropertiesMax: 5,
} as const;
