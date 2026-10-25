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
