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
};

const clip = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

/** Sólo rutas internas ("/propiedades/x"): una dirección completa o "//otro-sitio" se descarta. */
export const safeHref = (href: string | null | undefined): string => (href && /^\/(?!\/)[^\s\\]*$/.test(href) ? href : "/notificaciones");

export function buildPushPayload(n: { id: string; type: string; title: string; body?: string | null; href?: string | null }, brandName: string): PushPayload {
  const priv = PRIVATE_PUSH_TYPES.has(n.type);
  return {
    title: clip(n.title.trim() || brandName, 90),
    body: priv ? `Tocá para verlo en ${brandName}.` : clip((n.body ?? "").trim(), 140),
    href: safeHref(n.href),
    tag: `n:${n.id}`,
  };
}
