/**
 * Claves VAPID: el par de claves con el que el servidor se identifica ante los servicios de push de los navegadores. Se generan con
 * WebCrypto (curva P-256) donde se usen —el navegador de quien administra, o Node en las pruebas—, así la clave PRIVADA nunca
 * viaja a ningún servidor de la plataforma: se pega una sola vez en las variables de entorno. Formato base64url sin relleno, el que
 * esperan `web-push` y `PushManager.subscribe`. Módulo isomórfico y puro.
 */

const toB64Url = (bytes: Uint8Array): string => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const fromB64Url = (value: string): Uint8Array => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

/** La clave pública VAPID es un punto sin comprimir de P-256: 65 bytes que empiezan con 0x04 (87 caracteres en base64url). */
export function isValidVapidPublicKey(value: string | null | undefined): value is string {
  if (!value || !/^[A-Za-z0-9_-]{87}$/.test(value)) return false;
  try {
    const bytes = fromB64Url(value);
    return bytes.length === 65 && bytes[0] === 4;
  } catch {
    return false;
  }
}

/** La clave privada es un entero de 32 bytes (43 caracteres en base64url). */
export function isValidVapidPrivateKey(value: string | null | undefined): value is string {
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
  try {
    return fromB64Url(value).length === 32;
  } catch {
    return false;
  }
}

export type VapidKeys = { publicKey: string; privateKey: string };

/** Genera un par nuevo. */
export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  if (!jwk.d || !jwk.x || !jwk.y) throw new Error("No se pudo generar el par de claves.");
  const x = fromB64Url(jwk.x);
  const y = fromB64Url(jwk.y);
  const raw = new Uint8Array(65);
  raw[0] = 4;
  raw.set(x, 1);
  raw.set(y, 33);
  return { publicKey: toB64Url(raw), privateKey: jwk.d.replace(/=+$/, "") };
}
