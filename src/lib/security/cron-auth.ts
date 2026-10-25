import { createHash, timingSafeEqual } from "node:crypto";
import { deriveCronToken } from "./cron-token";
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
