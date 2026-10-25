/**
 * Limpieza del texto de un mail antes de entenderlo y guardarlo: se quita lo que no es del mensaje (lo citado de mails
 * anteriores, la firma, los avisos legales, el "enviado desde mi celular") y se acota el largo. Sólo texto: ni HTML ni adjuntos.
 */
import { MAIL_LIMITS } from "./constants";

/** Caracteres invisibles (espacios de ancho cero, marcas de dirección, BOM): se quitan para que no escondan texto. Armado desde códigos para que el archivo no los contenga. */
const c = (n: number) => String.fromCharCode(n);
const INVISIBLE = new RegExp(`[${c(0x200b)}-${c(0x200f)}${c(0x202a)}-${c(0x202e)}${c(0x2060)}${c(0xfeff)}]`, "g");

// Desde estas líneas, todo lo que sigue es una cita o un pie: se corta ahí.
const CUT_FROM = [
  /^\s*(on|el)\b.{5,160}\b(wrote|escribi[oó]|dijo)\s*:?\s*$/i, // "El 3 oct 2026, Juan escribió:" (en una línea)
  /^\s*-{2,}\s*(original message|mensaje original|forwarded message|mensaje reenviado)\s*-{2,}\s*$/i,
  /^\s*_{5,}\s*$/, // línea de guiones bajos de Outlook
  /^\s*(de|from)\s*:.{3,}$/i, // "De: Juan <j@x.com>" (encabezado pegado)
  /^\s*(enviado|sent)\s*(el|on)?\s*:.{3,}$/i,
  /^\s*--\s*$/, // delimitador de firma estándar
  /^\s*(enviado desde mi|sent from my|obtener outlook|get outlook|enviado con|sent with)\b.*/i,
  /^\s*(este (mensaje|correo|e-?mail)|the information|this (e-?mail|message))\b.*(confidencial|confidential|destinatario|intended|privileged).*$/i,
  /^\s*(aviso legal|disclaimer|confidencial)\b.*$/i,
];

/** Junta una cita de dos líneas ("El 3 oct, Juan\n<j@x.com> escribió:") en una sola para poder reconocerla. */
function joinWrappedAttribution(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const next = lines[i + 1];
    if (/^\s*(on|el)\b/i.test(line) && !/(wrote|escribi[oó]|dijo)\s*:?\s*$/i.test(line) && next && /(wrote|escribi[oó]|dijo)\s*:?\s*$/i.test(next) && line.length + next.length < 240) {
      out.push(`${line} ${next}`);
      i++;
    } else {
      out.push(line);
    }
  }
  return out;
}

/** El texto del mensaje, sin citas, firma ni avisos. Con `max` se acota el largo. */
export function cleanBody(raw: string, max: number = MAIL_LIMITS.maxText): string {
  const text = raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(INVISIBLE, "");

  const kept: string[] = [];
  for (const line of joinWrappedAttribution(text.split("\n"))) {
    if (CUT_FROM.some((re) => re.test(line))) break;
    if (/^\s*>/.test(line)) continue; // línea citada
    kept.push(line);
  }

  return kept
    .join("\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

/** Texto plano de un HTML (para los mails que sólo traen HTML): sin etiquetas, scripts ni estilos. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
