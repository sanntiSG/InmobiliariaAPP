/**
 * Los grupos de la bandeja del correo (módulo puro: lo usan las pantallas y el servidor, y no puede importar nada de la base de datos).
 *
 * La bandeja se organiza por lo que hay que HACER: "Necesita tu atención" (para confirmar, dudas sin responder, mails que el agente no
 * entendió, envíos con error), "Respondidos" (solos o por una persona) e "Ignorados". Un afinado (`sub`) filtra dentro del grupo.
 */
export type MailGroup = "attention" | "answered" | "ignored";
export type MailSub = "all" | "confirm" | "doubts" | "unsure" | "errors" | "auto" | "person";

export const SUBS_BY_GROUP: Record<MailGroup, MailSub[]> = {
  attention: ["all", "confirm", "doubts", "unsure", "errors"],
  answered: ["all", "auto", "person"],
  ignored: ["all"],
};
