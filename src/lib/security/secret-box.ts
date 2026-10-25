/**
 * Cifrado de secretos (las contraseñas de aplicación de los buzones de correo): AES-256-GCM con una clave que vive sólo en
 * las variables de entorno (`MAIL_CREDENTIALS_KEY`, 32 bytes en base64). Nada de esto sale de este archivo en claro: la base
 * guarda `v1:<id de clave>:<iv>:<etiqueta>:<texto cifrado>`, y los "datos asociados" (AAD) atan cada secreto a su dueño —un
 * secreto copiado a otro buzón no se puede abrir—. Con `MAIL_CREDENTIALS_KEY_PREVIOUS` se puede rotar la clave sin perder
 * lo ya guardado: se abre con la anterior y se vuelve a guardar con la nueva.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class SecretBoxError extends Error {
  constructor(
    public code: "no_key" | "bad_format" | "unknown_key" | "tampered",
    message: string
  ) {
    super(message);
  }
}

type Key = { id: string; bytes: Buffer };

function toKey(raw: string | undefined | null): Key | null {
  if (!raw) return null;
  const bytes = Buffer.from(raw.trim(), "base64");
  if (bytes.length !== KEY_BYTES) return null;
  // El id de la clave es un resumen corto: sirve para saber con cuál se cifró, sin revelarla.
  return { id: createHash("sha256").update(bytes).digest("hex").slice(0, 8), bytes };
}

export type SecretBox = {
  /** ¿Hay una clave válida? Sin ella no se puede conectar ningún buzón. */
  ready(): boolean;
  seal(plain: string, aad: string): string;
  open(sealed: string, aad: string): string;
  /** Texto cifrado con una clave que ya no es la actual (conviene volver a guardarlo). */
  needsRotation(sealed: string): boolean;
};

const b64 = (b: Buffer) => b.toString("base64url");

/** Una caja con las claves dadas (los scripts de prueba usan claves de mentira; la real lee el entorno). */
export function createSecretBox(keys: { current?: string | null; previous?: string | null }): SecretBox {
  const current = toKey(keys.current);
  const previous = toKey(keys.previous);

  const open = (sealed: string, aad: string): string => {
    const parts = sealed.split(":");
    if (parts.length !== 5 || parts[0] !== VERSION) throw new SecretBoxError("bad_format", "Secreto con formato inválido.");
    const [, kid, iv, tag, data] = parts as [string, string, string, string, string];
    const key = [current, previous].find((k) => k?.id === kid);
    if (!key) throw new SecretBoxError("unknown_key", "El secreto se cifró con una clave que ya no está disponible.");
    try {
      const decipher = createDecipheriv("aes-256-gcm", key.bytes, Buffer.from(iv, "base64url"));
      decipher.setAAD(Buffer.from(aad, "utf8"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
    } catch {
      throw new SecretBoxError("tampered", "No se pudo abrir el secreto (alterado o de otro dueño).");
    }
  };

  return {
    ready: () => !!current,
    seal(plain, aad) {
      if (!current) throw new SecretBoxError("no_key", "Falta la clave de cifrado (MAIL_CREDENTIALS_KEY).");
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv("aes-256-gcm", current.bytes, iv);
      cipher.setAAD(Buffer.from(aad, "utf8"));
      const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      return [VERSION, current.id, b64(iv), b64(cipher.getAuthTag()), b64(data)].join(":");
    },
    open,
    needsRotation: (sealed) => !!current && sealed.split(":")[1] !== current.id,
  };
}

/** La caja con las claves del entorno (se leen en cada uso: así un cambio de variable no pide reiniciar nada). */
export const secretBox: SecretBox = {
  ready: () => createSecretBox({ current: process.env.MAIL_CREDENTIALS_KEY }).ready(),
  seal: (plain, aad) => createSecretBox({ current: process.env.MAIL_CREDENTIALS_KEY, previous: process.env.MAIL_CREDENTIALS_KEY_PREVIOUS }).seal(plain, aad),
  open: (sealed, aad) => createSecretBox({ current: process.env.MAIL_CREDENTIALS_KEY, previous: process.env.MAIL_CREDENTIALS_KEY_PREVIOUS }).open(sealed, aad),
  needsRotation: (sealed) => createSecretBox({ current: process.env.MAIL_CREDENTIALS_KEY, previous: process.env.MAIL_CREDENTIALS_KEY_PREVIOUS }).needsRotation(sealed),
};

/** Datos asociados de la contraseña de un buzón: atan el secreto a su inmobiliaria y a su buzón. */
export const mailboxAad = (agencyId: string, mailboxId: string): string => `mailbox:${agencyId}:${mailboxId}`;
