/**
 * Validación de lo que el navegador manda al suscribirse. El servidor hará un POST a esa dirección cuando haya un aviso, así que
 * sólo se aceptan los servicios de push REALES de los navegadores (lista cerrada, siempre https): nadie puede registrar una
 * dirección interna o ajena para que el servidor la llame (SSRF). Funciones puras.
 */

/** Dominios de los servicios de push de Chrome/Edge/Opera/Samsung (FCM), Firefox, Safari y Edge/Windows (WNS). */
const PUSH_HOSTS: { exact?: string; suffix?: string }[] = [
  { exact: "fcm.googleapis.com" },
  { exact: "updates.push.services.mozilla.com" },
  { suffix: ".push.services.mozilla.com" },
  { exact: "web.push.apple.com" },
  { suffix: ".push.apple.com" },
  { suffix: ".notify.windows.com" },
];

export function isKnownPushEndpoint(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((h) => (h.exact ? host === h.exact : host.endsWith(h.suffix!) && host.length > h.suffix!.length));
}

const B64URL = /^[A-Za-z0-9_-]+$/;

/** Las claves del dispositivo: `p256dh` (65 bytes) y `auth` (16 bytes), en base64url. */
export function areValidSubscriptionKeys(keys: { p256dh?: string; auth?: string } | null | undefined): keys is { p256dh: string; auth: string } {
  return !!keys && typeof keys.p256dh === "string" && typeof keys.auth === "string" && keys.p256dh.length >= 80 && keys.p256dh.length <= 100 && B64URL.test(keys.p256dh) && keys.auth.length >= 20 && keys.auth.length <= 30 && B64URL.test(keys.auth);
}
