/**
 * A qué conversación pertenece un mail: lo usa la bandeja para agrupar los mails de una misma conversación. Se toma la raíz del
 * hilo (la primera referencia, o a lo que responde, o el propio mail si empieza una conversación) y, si el mail no trae
 * identificadores de hilo, se arma con quien escribe y el asunto sin "Re:". Módulo puro.
 */

const real = (id: string | null | undefined): string | null => (id && !id.startsWith("uid:") && id.trim().length > 3 ? id.trim() : null);

/** El asunto sin "Re:", "Fwd:" y similares, en minúsculas y en un solo renglón: dos mails de una conversación dan el mismo. */
export function normalizeSubject(subject: string | null | undefined): string {
  return (subject ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/^\s*((re|rv|fwd?|fw)\s*:\s*)+/i, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function threadKeyOf(m: { messageId: string; inReplyTo?: string | null; references?: readonly string[] | null; fromEmail: string; subject?: string | null }): string {
  const root = real(m.references?.find((r) => real(r))) ?? real(m.inReplyTo) ?? real(m.messageId);
  if (root) return `m:${root}`.slice(0, 200);
  return `s:${m.fromEmail.toLowerCase()}:${normalizeSubject(m.subject)}`.slice(0, 200);
}
