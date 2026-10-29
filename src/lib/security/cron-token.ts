import { createHmac } from "node:crypto";

/**
 * Clave con la que el programador de Netlify llama a la revisión del correo, DERIVADA de la clave de cifrado (HMAC-SHA256
 * con una etiqueta fija): así la plataforma necesita una sola variable, y el resultado no deja deducir la clave original.
 * Sin dependencias del resto de la aplicación, porque también la usa la función programada de Netlify.
 */
export const CRON_TOKEN_LABEL = "recorrr:mail-poll:v1";

export function deriveCronToken(key: string): string {
  return createHmac("sha256", key.trim()).update(CRON_TOKEN_LABEL).digest("hex");
}

/**
 * La clave de las demás tareas programadas (`/api/cron/sweep`: reintentos de avisos, "se liberó", alertas), derivada del secreto
 * de las sesiones (`AUTH_SECRET`), que ya existe en cualquier despliegue. Etiqueta distinta a la del correo: esta clave NO sirve
 * para la revisión del correo, y ninguna de las dos deja deducir el secreto original.
 */
export const SWEEP_TOKEN_LABEL = "recorrr:sweep:v1";

export function deriveSweepToken(authSecret: string): string {
  return createHmac("sha256", authSecret.trim()).update(SWEEP_TOKEN_LABEL).digest("hex");
}
