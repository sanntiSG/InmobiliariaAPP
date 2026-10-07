import { headers } from "next/headers";

/**
 * Origen público del sitio (`https://mi-sitio.com`) para armar links absolutos
 * (por ejemplo, el link de una propiedad dentro de un mensaje de WhatsApp).
 * Sale de los headers del proxy; si no hay, de `AUTH_URL`.
 */
export async function getSiteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.|192\.168\.)/.test(host) ? "http" : "https");
    return `${proto}://${host}`;
  }
  return (process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
