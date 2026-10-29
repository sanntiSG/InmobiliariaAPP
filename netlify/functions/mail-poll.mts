/**
 * Tareas programadas de la plataforma: Netlify ejecuta esta función cada 5 minutos y ella llama a rutas protegidas del propio
 * sitio. No hace falta cargar nada más fuera de Netlify: las claves de las llamadas se derivan de variables que ya existen
 * (`MAIL_CREDENTIALS_KEY` para el correo y `AUTH_SECRET` para el resto). Sólo corre en el despliegue publicado, nunca en vistas
 * previas. Es UNA sola función a propósito (cada ejecución cuesta créditos): hace, en orden,
 *   1. la revisión del correo (`/api/cron/mail-poll`), sólo si el correo está activado: una llamada revisa un lote (la ruta se
 *      corta a los 8 s); si quedan mails (`more: true`) se vuelve a llamar, hasta 3 veces;
 *   2. las tareas que no dependen de que alguien navegue (`/api/cron/sweep`), con o sin correo: avisar cuando un alquiler vuelve
 *      a estar disponible porque terminó un período ocupado, las alertas del admin y oportunidades de las inmobiliarias, y enviar
 *      los avisos del dispositivo (push) que quedaron pendientes.
 * Un fallo en una de las dos no frena a la otra. Todo dentro de los 30 s que Netlify da a una función programada. Sólo se
 * registran conteos: nunca contenido de mails.
 */
import { deriveCronToken, deriveSweepToken } from "../../src/lib/security/cron-token";

const MAX_CALLS = 3;
/** El correo usa hasta 20 s; el resto del tiempo queda para las demás tareas. */
const TOTAL_MS = 20_000;
const SWEEP_MS = 8_000;
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

/** La clave de las tareas: la derivada de `AUTH_SECRET` y, si esa variable no llegara a la función, la del correo (como antes). */
function sweepToken(mailKey: string | undefined): string | null {
  const auth = process.env.AUTH_SECRET?.trim();
  if (auth && auth.length >= 32) return deriveSweepToken(auth);
  if (mailKey) {
    console.warn("sweep: AUTH_SECRET no está disponible para la función; se usa la clave del correo.");
    return deriveCronToken(mailKey);
  }
  return null;
}

export default async function handler(_req: Request, context?: Context): Promise<void> {
  const mailKey = process.env.MAIL_CREDENTIALS_KEY?.trim();
  const mailOn = !!mailKey && process.env.MAIL_POLLER_ENABLED !== "false";
  const sweepKey = sweepToken(mailKey);
  if (!mailOn && !sweepKey) {
    console.log("mail-poll: no hay claves cargadas (ni AUTH_SECRET ni MAIL_CREDENTIALS_KEY), no se hace nada.");
    return;
  }
  const origin = siteOrigin(context);
  if (!origin) {
    console.error("mail-poll: no encuentro la dirección del sitio (cargá AUTH_URL).");
    return;
  }

  if (mailOn) await pollMail(origin, deriveCronToken(mailKey!));
  else console.log("mail-poll: el correo no está activado, sólo se hacen las demás tareas.");
  if (sweepKey) await runSweep(origin, sweepKey);
}

/** Las demás tareas programadas (ver `/api/cron/sweep`). Un fallo acá se registra y nada más. */
async function runSweep(origin: string, token: string): Promise<void> {
  try {
    const res = await fetch(`${origin}/api/cron/sweep`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      redirect: "manual",
      signal: AbortSignal.timeout(SWEEP_MS),
    });
    if (!res.ok) {
      console.error(`sweep: el sitio respondió ${res.status}.`);
      return;
    }
    const body = (await res.json().catch(() => null)) as { availability?: { checked?: number; changed?: number; freed?: number }; jobs?: { adminAlerts?: boolean; opportunities?: number } | null; push?: { claimed?: number; sent?: number; skipped?: number; failed?: number; retry?: number; removed?: number } | null } | null;
    const a = body?.availability;
    if (a && (a.changed || a.freed)) console.log(`sweep: revisados ${a.checked ?? 0}, cambiaron ${a.changed ?? 0}, quedaron libres ${a.freed ?? 0}.`);
    const j = body?.jobs;
    if (j && (j.adminAlerts || j.opportunities)) console.log(`sweep: alertas del admin ${j.adminAlerts ? "revisadas" : "sin cambios"}, oportunidades de ${j.opportunities ?? 0} inmobiliaria(s).`);
    const p = body?.push;
    if (p && p.claimed) console.log(`sweep: avisos del dispositivo: enviados ${p.sent ?? 0}, omitidos ${p.skipped ?? 0}, a reintentar ${p.retry ?? 0}, con error ${p.failed ?? 0}, dispositivos dados de baja ${p.removed ?? 0}.`);
  } catch (err) {
    console.error(`sweep: falló (${(err as Error)?.name ?? "error"}).`);
  }
}

/** La revisión del correo (ver arriba). */
async function pollMail(origin: string, token: string): Promise<void> {
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
