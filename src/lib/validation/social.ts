/**
 * Redes sociales de una inmobiliaria (Instagram, Facebook, TikTok). Se escribe el usuario ("@inmobiliariass") o se pega el
 * enlace al perfil, y se guarda SIEMPRE la dirección completa y canónica: https, el dominio de esa red (nunca uno ajeno) y un
 * camino acotado. Así lo que se muestra en el perfil público y en la firma de los mails nunca puede apuntar a otro sitio ni
 * llevar parámetros de rastreo. Funciones puras: se usan en el formulario, en el servidor, en el perfil y en la firma.
 */

export const SOCIAL_NETWORKS = ["instagram", "facebook", "tiktok"] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

export const SOCIAL_LABELS: Record<SocialNetwork, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" };

/** Dominio canónico de cada red y los que se aceptan al pegar un enlace. */
const CANONICAL_HOST: Record<SocialNetwork, string> = { instagram: "www.instagram.com", facebook: "www.facebook.com", tiktok: "www.tiktok.com" };
const ACCEPTED_HOSTS: Record<SocialNetwork, string[]> = {
  instagram: ["instagram.com", "www.instagram.com"],
  facebook: ["facebook.com", "www.facebook.com", "m.facebook.com", "fb.com", "www.fb.com"],
  tiktok: ["tiktok.com", "www.tiktok.com"],
};

/** Un usuario suelto: letras, números, punto y guion bajo (los tres lo permiten). */
const HANDLE = /^[A-Za-z0-9._]{1,60}$/;
/** El camino del perfil: sin parámetros ni caracteres raros (el @ es de TikTok). */
const PATH = /^\/[A-Za-z0-9._@%/-]{1,120}$/;

export type SocialResult = { ok: true; url: string } | { ok: false; error: string };

const ASK: Record<SocialNetwork, string> = {
  instagram: "Ingresá tu usuario de Instagram (por ejemplo @mi_inmobiliaria) o el enlace a tu perfil.",
  facebook: "Ingresá el nombre de tu página de Facebook o el enlace a ella.",
  tiktok: "Ingresá tu usuario de TikTok (por ejemplo @mi_inmobiliaria) o el enlace a tu perfil.",
};

function fromHandle(network: SocialNetwork, handle: string): string {
  return network === "tiktok" ? `https://${CANONICAL_HOST.tiktok}/@${handle}` : `https://${CANONICAL_HOST[network]}/${handle}`;
}

/**
 * Normaliza lo que escribió la persona. Vacío es válido (la red es opcional) y da `""`. Aplicarla dos veces da lo mismo
 * (el formulario normaliza y el servidor vuelve a validar).
 */
export function parseSocial(network: SocialNetwork, raw: string | null | undefined): SocialResult {
  const text = (raw ?? "").trim();
  if (text === "") return { ok: true, url: "" };
  if (text.length > 200) return { ok: false, error: ASK[network] };

  // Un usuario suelto ("@casa_ss", "casa.ss").
  const handle = text.replace(/^@/, "");
  if (!/[/:?#\s]/.test(handle) && HANDLE.test(handle)) {
    // "instagram.com" a secas no es un usuario: falta el nombre del perfil.
    if (ACCEPTED_HOSTS[network].includes(handle.toLowerCase())) return { ok: false, error: ASK[network] };
    return { ok: true, url: fromHandle(network, handle) };
  }

  // Un enlace (con o sin "https://").
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, error: ASK[network] };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: ASK[network] };
  if (url.username || url.password || url.port) return { ok: false, error: ASK[network] };
  if (!ACCEPTED_HOSTS[network].includes(url.hostname.toLowerCase())) return { ok: false, error: `Ese enlace no es de ${SOCIAL_LABELS[network]}.` };

  const path = url.pathname.replace(/\/+$/, "");
  if (!PATH.test(path)) return { ok: false, error: ASK[network] };
  // En Facebook, un perfil sin nombre se identifica por su número (profile.php?id=…): es lo único de la consulta que se conserva.
  let query = "";
  if (network === "facebook" && /^\/profile\.php$/i.test(path)) {
    const id = url.searchParams.get("id") ?? "";
    if (!/^\d{5,20}$/.test(id)) return { ok: false, error: ASK[network] };
    query = `?id=${id}`;
  }
  return { ok: true, url: `https://${CANONICAL_HOST[network]}${path}${query}` };
}

/** Las redes cargadas, en orden y con su enlace listo (las vacías o inválidas no aparecen). */
export function socialLinks(contact: Partial<Record<SocialNetwork, string | null | undefined>> | null | undefined): { network: SocialNetwork; label: string; url: string }[] {
  const out: { network: SocialNetwork; label: string; url: string }[] = [];
  for (const network of SOCIAL_NETWORKS) {
    const r = parseSocial(network, contact?.[network]);
    if (r.ok && r.url) out.push({ network, label: SOCIAL_LABELS[network], url: r.url });
  }
  return out;
}
