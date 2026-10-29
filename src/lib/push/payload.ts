/**
 * Lo que viaja en un aviso del dispositivo. Dos reglas: (1) nada de datos personales en la pantalla bloqueada —los avisos que
 * pueden nombrar a un cliente o un mail muestran un texto genérico y el detalle se ve al entrar— y (2) el enlace es siempre una ruta
 * interna (nunca una dirección externa). El nombre de la plataforma sale de la configuración, nunca escrito acá. Función pura.
 */
import { PRIVATE_PUSH_TYPES } from "@/config/notifications";

export type PushPayload = {
  title: string;
  body: string;
  /** Ruta interna a la que lleva el aviso. */
  href: string;
  /** Avisos con el mismo `tag` se reemplazan en vez de apilarse. */
  tag: string;
  /** Con un `tag` compartido, el reemplazo vuelve a sonar/vibrar (si no, el sistema lo cambia en silencio). */
  renotify: boolean;
};

const clip = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

/** Un `tag` propio sólo con caracteres seguros y corto; cualquier otra cosa vuelve al `tag` por aviso. */
const TAG = /^[\w:.-]{1,64}$/;

/** Sólo rutas internas ("/propiedades/x"): una dirección completa o "//otro-sitio" se descarta. */
export const safeHref = (href: string | null | undefined): string => (href && /^\/(?!\/)[^\s\\]*$/.test(href) ? href : "/notificaciones");

type PushSource = {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
  /** Agrupación pedida por quien creó el aviso: un `tag` compartido y/o un título propio (por ejemplo, con el total pendiente). */
  push?: { tag?: string | null; title?: string | null } | null;
};

export function buildPushPayload(n: PushSource, brandName: string): PushPayload {
  const priv = PRIVATE_PUSH_TYPES.has(n.type);
  const sharedTag = n.push?.tag && TAG.test(n.push.tag) ? n.push.tag : null;
  // El título propio nunca nombra a nadie: lo arma el servidor (conteos), pero igual se acota como cualquier otro.
  const title = n.push?.title?.trim() || n.title.trim() || brandName;
  return {
    title: clip(title, 90),
    body: priv ? `Tocá para verlo en ${brandName}.` : clip((n.body ?? "").trim(), 140),
    href: safeHref(n.href),
    tag: sharedTag ?? `n:${n.id}`,
    renotify: sharedTag !== null,
  };
}
