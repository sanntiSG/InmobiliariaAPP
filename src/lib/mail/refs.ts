/**
 * Qué propiedad nombra un mail: los enlaces a nuestras fichas (`https://<nuestro sitio>/propiedades/<slug>`) son la señal más
 * fuerte —los portales y las redes los usan—. Sólo se reconocen los hosts propios del sitio; cualquier otro enlace se ignora.
 */
const URL_RE = /https?:\/\/([a-z0-9.-]+)(?::\d+)?\/propiedades\/([a-z0-9][a-z0-9-]{2,120})/gi;

/** Slugs de propiedades enlazadas en el texto (hosts propios únicamente), sin repetir y hasta `max`. */
export function extractSlugs(text: string, hosts: readonly string[], max = 5): string[] {
  const own = new Set(hosts.map((h) => h.toLowerCase().replace(/^www\./, "")));
  const out: string[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const host = m[1]!.toLowerCase().replace(/^www\./, "");
    const slug = m[2]!.toLowerCase();
    if (own.has(host) && !out.includes(slug)) out.push(slug);
    if (out.length >= max) break;
  }
  return out;
}
