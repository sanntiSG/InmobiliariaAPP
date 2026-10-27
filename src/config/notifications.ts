/**
 * A qué grupo pertenece cada tipo de notificación y qué se puede silenciar. Una sola fuente para el servidor (que decide si crea o
 * envía un aviso según las preferencias de la persona) y para la interfaz (campana, página de avisos y ajustes). Módulo puro.
 */

export const NOTIFICATION_GROUPS = ["recomendaciones", "actividad", "gestion", "sistema"] as const;
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number];

export const NOTIFICATION_GROUP_LABELS: Record<NotificationGroup, string> = {
  recomendaciones: "Recomendaciones",
  actividad: "Actividad",
  gestion: "Gestión",
  sistema: "Sistema",
};

/** Qué incluye cada grupo, en palabras simples (para la pantalla de ajustes). */
export const NOTIFICATION_GROUP_HINTS: Record<NotificationGroup, string> = {
  recomendaciones: "Propiedades nuevas que te pueden gustar, bajas de precio, alquileres que se liberan y novedades de las inmobiliarias que seguís.",
  actividad: "Respuestas a tus comentarios y movimiento en lo que seguís.",
  gestion: "Consultas de clientes, respuestas del agente de correo para confirmar, oportunidades y avisos del panel.",
  sistema: "Avisos importantes de tu cuenta (por ejemplo, el permiso para gestionar una inmobiliaria).",
};

/** Lo que una persona puede silenciar. Los avisos del sistema (permisos, seguridad) siempre llegan. */
export const MUTABLE_GROUPS: readonly NotificationGroup[] = ["recomendaciones", "actividad", "gestion"];

/** Los grupos que tienen sentido mostrarle a cada tipo de cuenta (cada una recibe cosas distintas). */
export function groupsForRole(role: string | null | undefined): NotificationGroup[] {
  if (role === "admin") return ["gestion"];
  if (role === "agency_owner" || role === "agency_agent") return ["gestion", "actividad"];
  return ["recomendaciones", "actividad"];
}

/** Un tipo por línea: es la única tabla que hay que tocar al sumar un tipo de notificación nuevo. */
export const TYPE_GROUP: Record<string, NotificationGroup> = {
  new_match: "recomendaciones",
  recommendation: "recomendaciones",
  price_drop: "recomendaciones",
  availability: "recomendaciones",
  follow_new_property: "recomendaciones",
  comment_reply: "actividad",
  activity: "actividad",
  social_post: "gestion",
  mail_draft: "gestion",
  mail_error: "gestion",
  mail_attention: "gestion",
  lead: "gestion",
  opportunity: "gestion",
  agency_request: "gestion",
  admin_alert: "gestion",
  agency_approved: "sistema",
  agency_rejected: "sistema",
  system: "sistema",
};

/** El grupo de un tipo (los desconocidos cuentan como "sistema": nunca se silencian por error). */
export const groupOf = (type: string): NotificationGroup => TYPE_GROUP[type] ?? "sistema";

/**
 * Tipos cuyo texto puede nombrar a un cliente o un mail: en la pantalla bloqueada del teléfono se muestra un texto genérico
 * ("Tocá para verlo") y el detalle se ve al entrar a la plataforma.
 */
export const PRIVATE_PUSH_TYPES: ReadonlySet<string> = new Set(["lead", "mail_draft", "mail_attention", "mail_error", "agency_request", "admin_alert", "opportunity"]);
