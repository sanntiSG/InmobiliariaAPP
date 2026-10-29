import { createHash, timingSafeEqual } from "node:crypto";
import { deriveCronToken, deriveSweepToken } from "./cron-token";
import { createSecretBox } from "./secret-box";

const MIN_SECRET_LENGTH = 32;

type Env = Record<string, string | undefined>;

/**
 * Las claves con las que se puede llamar al cron: la derivada de `MAIL_CREDENTIALS_KEY` (la que usa el programador de
 * Netlify, sin cargar nada más) y, si existe, `CRON_SECRET` (para un programador externo). Una clave corta o inválida no
 * cuenta: una variable olvidada o mal pegada nunca deja la ruta abierta.
 */
export function cronSecrets(env: Env = process.env): string[] {
  const out: string[] = [];
  const key = env.MAIL_CREDENTIALS_KEY?.trim();
  if (key && createSecretBox({ current: key }).ready()) out.push(deriveCronToken(key));
  if (env.CRON_SECRET && env.CRON_SECRET.length >= MIN_SECRET_LENGTH) out.push(env.CRON_SECRET);
  return out;
}

/**
 * Las claves con las que se puede llamar a `/api/cron/sweep`: la derivada de `AUTH_SECRET` (siempre existe, así las tareas no
 * dependen de que el correo esté configurado) y, para no romper lo ya publicado, las del correo (`cronSecrets`). Un secreto corto
 * no cuenta. La del sweep NO sirve en `/api/cron/mail-poll`, que sigue usando sólo `cronSecrets`.
 */
export function sweepSecrets(env: Env = process.env): string[] {
  const out: string[] = [];
  const auth = env.AUTH_SECRET?.trim();
  if (auth && auth.length >= MIN_SECRET_LENGTH) out.push(deriveSweepToken(auth));
  return [...out, ...cronSecrets(env)];
}

/**
 * ¿La llamada trae una clave válida del cron (`Authorization: Bearer <clave>`)? Se comparan los resúmenes SHA-256 con
 * `timingSafeEqual` (tiempo constante, y sin importar el largo de lo que mandaron). Sin claves configuradas, NADIE pasa.
 */
export function verifyCronRequest(req: Request, secrets: readonly string[] = cronSecrets()): boolean {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return false;
  const given = createHash("sha256").update(match[1]!).digest();
  let ok = false;
  for (const secret of secrets) {
    if (secret.length < MIN_SECRET_LENGTH) continue;
    // Se comparan todas, sin cortar en la primera que coincide.
    if (timingSafeEqual(given, createHash("sha256").update(secret).digest())) ok = true;
  }
  return ok;
}
