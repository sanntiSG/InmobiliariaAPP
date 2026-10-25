/**
 * Qué puede hacer ESTE despliegue con el correo, decidido solo a partir de lo que ya hay: con la clave de cifrado cargada,
 * la web principal (Netlify) revisa y envía; la de respaldo (Render, que en el plan gratis bloquea el envío) deja todo en
 * cola para que lo mande la principal. `MAIL_POLLER_ENABLED` y `MAIL_SEND_ENABLED` siguen existiendo sólo para forzar
 * ("true" enciende, "false" apaga) y no hace falta cargarlas. Función pura: se prueba sin entorno real.
 */
import { createSecretBox } from "../security/secret-box";

type Env = Record<string, string | undefined>;

export type MailRuntime = {
  /** Hay una clave válida para cifrar las contraseñas de las casillas. */
  keyReady: boolean;
  /** "backup": la web de respaldo en Render; "main": la principal. */
  platform: "main" | "backup";
  /** Este despliegue corre la revisión programada. */
  poller: boolean;
  /** Este despliegue puede enviar mails por SMTP. */
  sender: boolean;
};

const forced = (v: string | undefined): boolean | null => (v === "true" ? true : v === "false" ? false : null);

export function mailRuntime(env: Env = process.env): MailRuntime {
  const keyReady = createSecretBox({ current: env.MAIL_CREDENTIALS_KEY }).ready();
  const platform = env.RENDER === "true" ? "backup" : "main";
  const byDefault = platform === "main";
  return {
    keyReady,
    platform,
    poller: keyReady && (forced(env.MAIL_POLLER_ENABLED) ?? byDefault),
    sender: keyReady && (forced(env.MAIL_SEND_ENABLED) ?? byDefault),
  };
}
