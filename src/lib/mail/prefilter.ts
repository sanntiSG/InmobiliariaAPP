/**
 * Primer filtro, sólo con los ENCABEZADOS del mail (antes de leer el texto): descarta lo que seguro no es una consulta de una
 * persona —respuestas automáticas, listas de correo, rebotes, mails propios o de remitentes bloqueados— y deja pasar lo
 * demás. Ojo con los portales (Zonaprop, Argenprop, Mercado Libre): mandan las consultas desde una casilla "no-reply" pero
 * con el mail del cliente en `Reply-To`, así que NO se descartan a ciegas.
 */
import type { MailCategory } from "./constants";

export type MailHeaders = {
  from: string;
  replyTo?: string | null;
  subject?: string | null;
  autoSubmitted?: string | null;
  precedence?: string | null;
  listId?: string | null;
  listUnsubscribe?: string | null;
  xAutoreply?: string | null;
  contentType?: string | null;
  returnPath?: string | null;
};

export type PrefilterContext = {
  /** La casilla del propio buzón (para no responderse a sí mismo). */
  ownEmail: string;
  /** Emails o dominios (`@dominio.com`, `dominio.com`) que nunca reciben respuesta. */
  blocked: string[];
};

export type PrefilterResult = { skip: false; portal: boolean } | { skip: true; category: MailCategory; reason: string };

/** Portales inmobiliarios que reenvían consultas de clientes. */
export const PORTAL_DOMAINS = ["zonaprop.com.ar", "argenprop.com", "mercadolibre.com", "mercadolibre.com.ar", "properati.com.ar", "inmuebles.clarin.com", "navent.com"];

const emailOf = (raw: string): string => (/<([^>]+)>/.exec(raw)?.[1] ?? raw).trim().toLowerCase();
const domainOf = (email: string): string => email.split("@")[1] ?? "";
const NO_REPLY = /^(no-?reply|do-?not-?reply|donotreply|noresponder|no-?responder|nao-?responda)(\+.*)?@/i;
const AUTOMATED_SUBJECT = /^(auto(matic)?[\s:-]*(reply|response)|respuesta autom[aá]tica|fuera de (la )?oficina|out of office|ausente|vacation|autoresponder)/i;

export function isPortalDomain(domain: string): boolean {
  return PORTAL_DOMAINS.some((p) => domain === p || domain.endsWith(`.${p}`));
}

export function isBlocked(email: string, blocked: string[]): boolean {
  const domain = domainOf(email);
  return blocked.some((b) => {
    const entry = b.trim().toLowerCase().replace(/^@/, "");
    return entry !== "" && (entry === email || entry === domain);
  });
}

export function prefilter(h: MailHeaders, ctx: PrefilterContext): PrefilterResult {
  const from = emailOf(h.from);
  const domain = domainOf(from);
  const reply = h.replyTo ? emailOf(h.replyTo) : null;
  const portal = isPortalDomain(domain);

  if (!from.includes("@")) return { skip: true, category: "other", reason: "No tiene un remitente válido." };
  if (from === ctx.ownEmail.toLowerCase()) return { skip: true, category: "other", reason: "Lo mandó la propia casilla del buzón." };
  if (isBlocked(from, ctx.blocked) || (reply && isBlocked(reply, ctx.blocked))) return { skip: true, category: "other", reason: "El remitente está bloqueado." };

  if (/^(mailer-daemon|postmaster)@/i.test(from) || /multipart\/report/i.test(h.contentType ?? "") || (h.returnPath ?? "").trim() === "<>") {
    return { skip: true, category: "bounce", reason: "Es un aviso del servidor de correo (rebote)." };
  }
  const auto = (h.autoSubmitted ?? "").trim().toLowerCase();
  if (auto && auto !== "no") return { skip: true, category: "automated", reason: "Está marcado como mensaje automático." };
  if (h.xAutoreply || AUTOMATED_SUBJECT.test((h.subject ?? "").trim())) return { skip: true, category: "automated", reason: "Es una respuesta automática (fuera de oficina o similar)." };

  if (!portal) {
    if (/^(bulk|list|junk)$/i.test((h.precedence ?? "").trim()) || h.listId || h.listUnsubscribe) {
      return { skip: true, category: "newsletter", reason: "Viene de una lista de correo o una promoción." };
    }
    if (NO_REPLY.test(from)) return { skip: true, category: "automated", reason: "Lo manda una casilla que no recibe respuestas." };
  } else if (NO_REPLY.test(from) && !reply) {
    return { skip: true, category: "automated", reason: "Es un aviso del portal sin el contacto del cliente." };
  }
  return { skip: false, portal };
}

/** A quién se le responde: el `Reply-To` si existe (así llegan los clientes de los portales); si no, el remitente. */
export function replyAddress(h: Pick<MailHeaders, "from" | "replyTo">): string {
  return emailOf(h.replyTo || h.from);
}

/** Nombre de la persona para el saludo: sólo letras, sin URLs ni emails, primera palabra con mayúscula. `null` si no sirve. */
export function firstNameOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\S+@\S+/g, " ")
    .replace(/["'()[\]{}]/g, " ");
  const word = cleaned.split(/[\s,;]+/).find((w) => /^[\p{L}][\p{L}'-]{1,24}$/u.test(w));
  if (!word) return null;
  const lower = word.toLowerCase();
  if (["info", "contacto", "consultas", "ventas", "administracion", "admin", "hola", "noreply", "soporte", "mail", "correo"].includes(lower)) return null;
  return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
}
