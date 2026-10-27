/**
 * La firma corporativa de los mails que responde el agente: un banner liviano con el logo, el nombre, la dirección y las vías de
 * contacto de la inmobiliaria, en su color. Es HTML de mail (tablas y estilos en línea: los clientes de correo no soportan más),
 * sin imágenes pesadas (sólo el logo, ya reducido) y SIEMPRE con una versión de texto. Todo lo que viene de la base se escapa
 * y los enlaces se validan: nada de lo que cargó la inmobiliaria puede inyectar HTML ni apuntar a esquemas raros. Funciones
 * puras (sin base de datos).
 */
import { socialLinks, type SocialNetwork } from "@/lib/validation/social";

export type SignatureAgency = {
  name: string;
  slug: string;
  logo?: string | null;
  /** Color de la inmobiliaria (`branding.accentColor`). Si no es un hex válido se usa el de la plataforma. */
  accentColor?: string | null;
  contact?: { phone?: string | null; whatsapp?: string | null; email?: string | null; website?: string | null } & Partial<Record<SocialNetwork, string | null>>;
  address?: { street?: string | null; city?: string | null; province?: string | null };
};

/** El pie de las respuestas automáticas (`compose.ts`): va debajo de la firma, chico y en gris. */
const DISCLOSURE = /\n+--\nEsta respuesta fue preparada por un asistente autom[aá]tico de [^\n]+\n?$/;

/** El color de acento de la plataforma (bronce), si la inmobiliaria no tiene uno válido. */
export const FALLBACK_ACCENT = "#78582e";

const INK = "#1c1b19";
const MUTED = "#6b665d";
const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Un color hex de 6 dígitos o el de la plataforma: nunca texto libre dentro de un estilo. */
export const safeHex = (color: string | null | undefined): string => (/^#[0-9a-fA-F]{6}$/.test((color ?? "").trim()) ? (color as string).trim().toLowerCase() : FALLBACK_ACCENT);

/** Blanco o casi negro, el que mejor se lee sobre ese color (luminancia relativa, WCAG). */
export function readableOn(hex: string): "#ffffff" | "#111111" {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? "#111111" : "#ffffff";
}

/** Dirección web (http/https) normalizada, o null. */
function safeWebUrl(raw: string | null | undefined): URL | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/** El logo a ~120 px y en PNG (los clientes de correo no siempre leen WebP/AVIF); sólo imágenes de nuestro almacenamiento. */
export function mailLogoUrl(src: string | null | undefined, siteUrl: string | null): string | null {
  const url = (src ?? "").trim();
  if (url.startsWith("https://res.cloudinary.com/")) {
    const marker = "/upload/";
    const i = url.indexOf(marker);
    return i === -1 ? url : `${url.slice(0, i + marker.length)}w_120,h_120,c_fill,f_png/${url.slice(i + marker.length)}`;
  }
  // Desarrollo sin Cloudinary: el archivo vive en el propio sitio.
  if (url.startsWith("/uploads/") && siteUrl) return `${siteUrl}${url}`;
  return null;
}

const digits = (s: string | null | undefined): string => (s ?? "").replace(/\D/g, "");
const telHref = (phone: string): string => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** "Calle 123, Ezeiza, Buenos Aires". */
function addressLine(a: SignatureAgency["address"]): string {
  return [a?.street, a?.city, a?.province].map((x) => (x ?? "").trim()).filter(Boolean).join(", ");
}

type Row = { label: string; text: string; href: string };

function contactRows(agency: SignatureAgency): Row[] {
  const c = agency.contact ?? {};
  const rows: Row[] = [];
  const phone = (c.phone ?? "").trim();
  if (phone && digits(phone).length >= 6) rows.push({ label: "Tel", text: phone, href: telHref(phone) });
  const wa = digits(c.whatsapp);
  if (wa.length >= 8) rows.push({ label: "WhatsApp", text: (c.whatsapp ?? "").trim(), href: `https://wa.me/${wa}` });
  const email = (c.email ?? "").trim();
  if (/^[^\s@<>()"']+@[^\s@<>()"']+\.[^\s@<>()"']{2,}$/.test(email)) rows.push({ label: "Email", text: email, href: `mailto:${email}` });
  const web = safeWebUrl(c.website);
  if (web) rows.push({ label: "Web", text: web.host + (web.pathname !== "/" ? web.pathname.replace(/\/$/, "") : ""), href: web.href });
  return rows;
}

/** La firma en texto plano (para quien lee el mail sin HTML y como respaldo). */
export function signatureText(agency: SignatureAgency, siteUrl: string | null): string {
  const lines = [`--`, agency.name.trim()];
  const address = addressLine(agency.address);
  if (address) lines.push(address);
  const rows = contactRows(agency).map((r) => `${r.label}: ${r.text}`);
  if (rows.length > 0) lines.push(rows.join(" · "));
  const social = socialLinks(agency.contact).map((s) => `${s.label}: ${s.url}`);
  if (social.length > 0) lines.push(social.join(" · "));
  if (siteUrl) lines.push(`Más propiedades: ${siteUrl}/inmobiliarias/${encodeURIComponent(agency.slug)}`);
  return lines.join("\n");
}

const link = (href: string, text: string, color: string): string => `<a href="${escapeHtml(href)}" style="color:${color};text-decoration:none" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;

/** El banner en HTML. */
export function signatureHtml(agency: SignatureAgency, siteUrl: string | null): string {
  const accent = safeHex(agency.accentColor);
  const onAccent = readableOn(accent);
  const name = escapeHtml(agency.name.trim());
  const logo = mailLogoUrl(agency.logo, siteUrl);
  const initial = escapeHtml(([...agency.name.trim()][0] ?? "·").toUpperCase());

  const mark = logo
    ? `<img src="${escapeHtml(logo)}" width="56" height="56" alt="${name}" style="display:block;width:56px;height:56px;border-radius:12px;border:0;outline:none;object-fit:cover">`
    : `<div style="width:56px;height:56px;border-radius:12px;background:${accent};color:${onAccent};font:700 24px/56px ${FONT};text-align:center">${initial}</div>`;

  const address = addressLine(agency.address);
  // Cada dato es un bloque que no se parte, pero la fila sí envuelve: en un celular pasan a la línea siguiente en vez de cortarse.
  const item = (inner: string): string => `<span style="display:inline-block;margin:0 16px 0 0;white-space:nowrap">${inner}</span>`;
  const rows = contactRows(agency)
    .map((r) => item(`<span style="color:${MUTED}">${escapeHtml(r.label)}&nbsp;</span>${link(r.href, r.text, INK)}`))
    .join("");
  const social = socialLinks(agency.contact)
    .map((s) => item(link(s.url, s.label, accent)))
    .join("");
  const profile = siteUrl ? `${siteUrl}/inmobiliarias/${encodeURIComponent(agency.slug)}` : null;

  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;border-collapse:collapse;max-width:520px;font-family:${FONT}">`,
    `<tr><td colspan="2" style="height:3px;line-height:3px;font-size:0;background:${accent}">&nbsp;</td></tr>`,
    `<tr>`,
    `<td width="70" valign="top" style="padding:16px 14px 0 0">${mark}</td>`,
    `<td valign="top" style="padding:16px 0 0">`,
    `<div style="font-size:16px;font-weight:700;line-height:1.3;color:${INK}">${name}</div>`,
    address ? `<div style="font-size:13px;line-height:1.5;color:${MUTED};margin-top:2px">${escapeHtml(address)}</div>` : "",
    rows ? `<div style="font-size:13px;line-height:1.9;margin-top:8px">${rows}</div>` : "",
    social ? `<div style="font-size:13px;line-height:1.9">${social}</div>` : "",
    `</td></tr>`,
    profile
      ? `<tr><td colspan="2" style="padding-top:16px"><a href="${escapeHtml(profile)}" style="display:inline-block;background:${accent};color:${onAccent};font-size:13px;font-weight:700;line-height:1;text-decoration:none;padding:11px 18px;border-radius:999px" target="_blank" rel="noopener noreferrer">Ver nuestras propiedades</a></td></tr>`
      : "",
    `</table>`,
  ].join("");
}

/** Texto plano → HTML: párrafos, saltos de línea y los enlaces https:// clicables. */
export function textToHtml(text: string): string {
  const linkify = (escaped: string): string =>
    escaped.replace(/https?:\/\/[^\s<]+/g, (match) => {
      // La puntuación que cierra la frase no es parte del enlace.
      const m = /^(.*?)([.,;:!?)\]]*)$/.exec(match)!;
      return `<a href="${m[1]}" style="color:inherit" target="_blank" rel="noopener noreferrer">${m[1]}</a>${m[2]}`;
    });
  return text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${linkify(escapeHtml(p)).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export type Outgoing = { text: string; html: string | null };

/**
 * El cuerpo de la respuesta con la firma: el texto de siempre (más la firma en texto) y su versión HTML con el banner. El aviso
 * de "respuesta automática" queda debajo de la firma. Con `banner: false` sale como antes: sólo texto.
 */
export function buildOutgoing(body: string, agency: SignatureAgency, siteUrl: string | null, opts: { banner: boolean }): Outgoing {
  if (!opts.banner) return { text: body, html: null };
  const m = DISCLOSURE.exec(body);
  const main = (m ? body.slice(0, m.index) : body).trimEnd();
  const disclosure = m ? m[0].replace(/^\n+--\n/, "").trim() : "";

  const text = [main, signatureText(agency, siteUrl), disclosure ? `--\n${disclosure}` : ""].filter(Boolean).join("\n\n");
  const html = [
    `<div style="font-family:${FONT};font-size:15px;line-height:1.55;color:${INK}">`,
    textToHtml(main),
    signatureHtml(agency, siteUrl),
    disclosure ? `<p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:${MUTED}">${escapeHtml(disclosure)}</p>` : "",
    `</div>`,
  ].join("");
  return { text, html };
}
