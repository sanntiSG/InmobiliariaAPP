/**
 * Cuando una inmobiliaria no tiene dueño ni agentes, sus avisos le llegan a los admins (ver `agencyRecipients`). Para que el enlace
 * abra el panel de ESA inmobiliaria ("ver como"), se le agrega `?agencyId=`; y el texto antepone su nombre para saber de cuál es.
 * Módulo puro (sin base de datos): lo prueban `push:check` y `mail:check`.
 */

/** Sólo rutas internas ("/dashboard/..."): cualquier otra cosa se devuelve igual, sin tocarla. */
export function withAgencyParam(href: string | undefined, agencyId: string): string | undefined {
  if (!href || !/^\/(?!\/)[^\s\\]*$/.test(href)) return href;
  if (!/^[a-f0-9]{24}$/i.test(agencyId)) return href;
  const url = new URL(href, "http://local.invalid");
  // Sólo el panel de la inmobiliaria elige agencia con `?agencyId=`; las fichas, las búsquedas y las rutas de admin no lo usan.
  if (url.pathname !== "/dashboard" && !url.pathname.startsWith("/dashboard/")) return href;
  url.searchParams.set("agencyId", agencyId);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Antepone el nombre de la inmobiliaria al texto del aviso (para el admin que lo recibe en su lugar). */
export function withAgencyName(body: string | undefined, agencyName: string): string {
  const name = agencyName.trim().slice(0, 60);
  const text = (body ?? "").trim();
  if (!name) return text;
  return text ? `«${name}» · ${text}` : `«${name}»`;
}
