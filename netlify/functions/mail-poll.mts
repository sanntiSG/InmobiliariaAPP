/**
 * Revisión programada del correo de las inmobiliarias: Netlify ejecuta esta función cada 5 minutos y ella llama a la ruta
 * protegida del propio sitio (`/api/cron/mail-poll`). No hace falta cargar nada fuera de Netlify: la clave de la llamada se
 * deriva de `MAIL_CREDENTIALS_KEY` (la misma variable que cifra las contraseñas de las casillas). Si esa variable no está,
 * no hace nada. Sólo corre en el despliegue publicado, nunca en vistas previas.
 *
 * Una llamada revisa un lote (la ruta se corta a los 8 s); si quedan mails (`more: true`) se vuelve a llamar, hasta 3 veces,
 * sin pasar los 30 s que Netlify da a una función programada. Sólo se registran conteos: nunca contenido de mails.
 */
import { deriveCronToken } from "../../src/lib/security/cron-token";

const MAX_CALLS = 3;
const TOTAL_MS = 26_000;
const PER_CALL_MS = 12_000;

type Context = { site?: { url?: string } };

/** Dirección https del sitio: la que cargó quien administra y, si no, la que Netlify informa. */
function siteOrigin(context?: Context): string | null {
  const candidates = [process.env.PUBLIC_SITE_URL, process.env.AUTH_URL, context?.site?.url, process.env.URL];
  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const url = new URL(raw.trim());
      if (url.protocol === "https:") return url.origin;
    } catch {
      // Se prueba con la siguiente.
    }
  }
  return null;
}

export default async function handler(_req: Request, context?: Context): Promise<void> {
  const key = process.env.MAIL_CREDENTIALS_KEY?.trim();
  if (!key || process.env.MAIL_POLLER_ENABLED === "false") {
    console.log("mail-poll: el correo no está activado, no se revisa nada.");
    return;
  }
  const origin = siteOrigin(context);
  if (!origin) {
    console.error("mail-poll: no encuentro la dirección del sitio (cargá AUTH_URL).");
    return;
  }

  const token = deriveCronToken(key);
  const started = Date.now();
  for (let i = 1; i <= MAX_CALLS; i++) {
    const left = TOTAL_MS - (Date.now() - started);
    if (left < 4_000) break;
    let res: Response;
    try {
      res = await fetch(`${origin}/api/cron/mail-poll`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        // Una redirección haría perder la clave (y convertiría el POST en GET): se trata como error.
        redirect: "manual",
        signal: AbortSignal.timeout(Math.min(PER_CALL_MS, left)),
      });
    } catch (err) {
      console.error(`mail-poll: la llamada ${i} falló (${(err as Error)?.name ?? "error"}).`);
      return;
    }
    if (res.status === 404) {
      console.log("mail-poll: este despliegue no corre la revisión del correo.");
      return;
    }
    if (res.status === 401) {
      console.error("mail-poll: el sitio no aceptó la clave (¿se cambió MAIL_CREDENTIALS_KEY sin volver a publicar?).");
      return;
    }
    if (res.status >= 300 && res.status < 400) {
      console.error("mail-poll: el sitio redirige; cargá PUBLIC_SITE_URL con la dirección final (con https).");
      return;
    }
    if (!res.ok) {
      console.error(`mail-poll: el sitio respondió ${res.status}.`);
      return;
    }
    const body = (await res.json().catch(() => null)) as { polled?: number; drafts?: number; sent?: number; errors?: number; more?: boolean } | null;
    console.log(`mail-poll: revisadas ${body?.polled ?? 0}, borradores ${body?.drafts ?? 0}, enviados ${body?.sent ?? 0}, con error ${body?.errors ?? 0}.`);
    if (!body?.more) return;
  }
}

export const config = { schedule: "*/5 * * * *" };
