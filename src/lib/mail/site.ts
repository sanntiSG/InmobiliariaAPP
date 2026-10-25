/**
 * Dirección pública del sitio para los enlaces que van DENTRO de un mail. Sale sólo de `PUBLIC_SITE_URL` (https), nunca del
 * encabezado `Host` de la petición: ese lo puede mandar cualquiera, y un enlace armado con él en un mail enviado a un cliente
 * sería una forma de hacer pasar otro sitio por el nuestro.
 */
export function getPublicSiteUrl(env: string | undefined = process.env.PUBLIC_SITE_URL): string | null {
  if (!env) return null;
  try {
    const u = new URL(env.trim());
    if (u.protocol !== "https:" && !(u.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Hosts propios del sitio (para reconocer enlaces a nuestras fichas dentro de un mail). */
export function siteHosts(env: { site?: string | undefined; extra?: string | undefined } = { site: process.env.PUBLIC_SITE_URL, extra: process.env.MAIL_SITE_HOSTS }): string[] {
  const hosts = new Set<string>();
  const site = getPublicSiteUrl(env.site);
  if (site) hosts.add(new URL(site).hostname.toLowerCase());
  for (const h of (env.extra ?? "").split(",")) {
    const host = h.trim().toLowerCase();
    if (/^[a-z0-9.-]+$/.test(host)) hosts.add(host);
  }
  return [...hosts];
}
