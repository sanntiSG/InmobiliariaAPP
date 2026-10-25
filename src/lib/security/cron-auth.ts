import { createHash, timingSafeEqual } from "node:crypto";

const MIN_SECRET_LENGTH = 32;

/**
 * ¿La llamada trae la clave del cron (`Authorization: Bearer <CRON_SECRET>`)? Se comparan los resúmenes SHA-256 con
 * `timingSafeEqual` (tiempo constante, y sin importar el largo de lo que mandaron). Si `CRON_SECRET` no está definido o es
 * corto, NADIE pasa: una variable olvidada nunca deja la ruta abierta.
 */
export function verifyCronRequest(req: Request, secret = process.env.CRON_SECRET): boolean {
  if (!secret || secret.length < MIN_SECRET_LENGTH) return false;
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return false;
  const given = createHash("sha256").update(match[1]!).digest();
  const wanted = createHash("sha256").update(secret).digest();
  return timingSafeEqual(given, wanted);
}
