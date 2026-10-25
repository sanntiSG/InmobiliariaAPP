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
  /** Días que se conserva un mail (a los 14 si se ignoró). */
  retentionDays: 60,
  retentionIgnoredDays: 14,
  maxPropertiesMin: 1,
  maxPropertiesMax: 5,
} as const;
