/**
 * Dirección pública del sitio para los enlaces que van DENTRO de un mail. Sale sólo de variables que carga quien administra
 * (`PUBLIC_SITE_URL` y, si falta, `AUTH_URL`, que cada plataforma ya tiene), nunca del encabezado `Host` de la petición: ese
 * lo puede mandar cualquiera, y un enlace armado con él en un mail enviado a un cliente sería una forma de hacer pasar otro
 * sitio por el nuestro. Sólo https (o http en localhost).
 */
export function getPublicSiteUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && !(u.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) return null;
    return u.origin;
  } catch {
    return null;
  }
}

type Env = Record<string, string | undefined>;

/** La dirección pública de ESTE despliegue: `PUBLIC_SITE_URL` si está, si no `AUTH_URL`. */
export function publicSiteUrl(env: Env = process.env): string | null {
  return getPublicSiteUrl(env.PUBLIC_SITE_URL) ?? getPublicSiteUrl(env.AUTH_URL);
}

/** Hosts propios del sitio (para reconocer enlaces a nuestras fichas dentro de un mail). */
export function siteHosts(
  env: { site?: string | undefined; auth?: string | undefined; extra?: string | undefined } = {
    site: process.env.PUBLIC_SITE_URL,
    auth: process.env.AUTH_URL,
    extra: process.env.MAIL_SITE_HOSTS,
  }
): string[] {
  const hosts = new Set<string>();
  for (const raw of [env.site, env.auth]) {
    const url = getPublicSiteUrl(raw);
    if (url) hosts.add(new URL(url).hostname.toLowerCase());
  }
  for (const h of (env.extra ?? "").split(",")) {
    const host = h.trim().toLowerCase();
    if (/^[a-z0-9.-]+$/.test(host)) hosts.add(host);
  }
  return [...hosts];
}
