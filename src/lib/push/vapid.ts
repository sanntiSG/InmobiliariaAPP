/**
 * Las claves VAPID de este despliegue, leídas de las variables de entorno. Hacen falta SÓLO donde se envían avisos (Netlify, junto a
 * la clave del correo); el navegador recibe únicamente la clave PÚBLICA, por `/api/push/key`. Si faltan, la plataforma sigue
 * funcionando igual: los avisos quedan pendientes y los envía el despliegue que sí las tiene.
 */
import { isValidVapidPrivateKey, isValidVapidPublicKey } from "./keys";
import { publicSiteUrl } from "@/lib/mail/site";

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

/** Debe ser una dirección https o `mailto:` (lo exige el estándar). */
function subject(): string {
  const raw = process.env.VAPID_SUBJECT?.trim();
  if (raw && (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) || /^https:\/\/[^\s]+$/.test(raw))) return raw;
  return publicSiteUrl() ?? "https://localhost";
}

export function vapidConfig(env: NodeJS.ProcessEnv = process.env): VapidConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!isValidVapidPublicKey(publicKey) || !isValidVapidPrivateKey(privateKey)) return null;
  return { publicKey, privateKey, subject: subject() };
}

/** La clave pública para suscribirse desde el navegador (o `null` si este despliegue no tiene claves). */
export const vapidPublicKey = (): string | null => vapidConfig()?.publicKey ?? null;
