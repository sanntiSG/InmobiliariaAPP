/**
 * Valida un `callbackUrl` que viene de la URL antes de redirigir ahí después
 * de iniciar sesión: sólo rutas internas ("/algo"), nunca "//otro-sitio.com"
 * ni esquemas externos — evita usar el login como open redirect.
 *
 * El proxy de Auth.js manda el callback como URL absoluta de este mismo sitio
 * (`https://mi-sitio/admin/x`): si `host` coincide, se reduce a su ruta.
 */
export function safeCallbackUrl(
  raw: string | string[] | undefined,
  { fallback = "/", host }: { fallback?: string; host?: string | null } = {}
): string {
  let value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || value.length > 300) return fallback;

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (!host || url.host !== host) return fallback;
      value = `${url.pathname}${url.search}`;
    } catch {
      return fallback;
    }
  }

  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}
