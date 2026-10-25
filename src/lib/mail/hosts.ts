/**
 * Defensa contra SSRF al conectar un servidor de correo "propio": como el servidor lo escribe una persona, sin esto se podría
 * usar la plataforma para tocar servicios internos (la red local, el servidor de metadatos de la nube, la propia base de
 * datos). Se exige un nombre de dominio común, se resuelve el DNS y se rechaza cualquier dirección que no sea pública; la
 * conexión se hace a la IP YA VERIFICADA (no se vuelve a resolver el nombre: así no hay "DNS rebinding").
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ALLOWED_IMAP_PORTS, ALLOWED_SMTP_PORTS } from "./presets";

export class HostError extends Error {}

type Resolver = (host: string) => Promise<{ address: string; family: number }[]>;

const defaultResolver: Resolver = (host) => lookup(host, { all: true });

/** ¿Es una dirección que NO debe tocarse desde acá? (privadas, de loopback, link-local, multicast, reservadas, IPv4 mapeadas en IPv6). */
export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number, number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local (incluye el servidor de metadatos de la nube)
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 // multicast y reservadas
    );
  }
  if (kind === 6) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isPrivateIp(mapped[1]!);
    return /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v) || v.startsWith("64:ff9b:") || v.startsWith("2001:db8");
  }
  return true; // lo que no es una IP válida no se acepta
}

const HOSTNAME = /^(?=.{1,200}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i;

/** Valida un servidor de correo escrito por una persona y devuelve la IP pública a la que conectarse. Lanza `HostError` si no sirve. */
export async function assertSafeMailHost(
  rawHost: string,
  port: number,
  kind: "imap" | "smtp",
  resolve: Resolver = defaultResolver
): Promise<{ host: string; address: string }> {
  const host = rawHost.trim().toLowerCase();
  const allowed: readonly number[] = kind === "imap" ? ALLOWED_IMAP_PORTS : ALLOWED_SMTP_PORTS;
  if (!allowed.includes(port)) throw new HostError(`El puerto ${port} no está permitido (usá ${allowed.join(" o ")}).`);
  if (isIP(host)) throw new HostError("Escribí el nombre del servidor (por ejemplo imap.tudominio.com), no una dirección numérica.");
  if (!HOSTNAME.test(host) || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
    throw new HostError("El nombre del servidor no es válido.");
  }
  let addresses: { address: string; family: number }[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new HostError("No encontré ese servidor. Revisá que esté bien escrito.");
  }
  if (addresses.length === 0) throw new HostError("No encontré ese servidor. Revisá que esté bien escrito.");
  if (addresses.some((a) => isPrivateIp(a.address))) throw new HostError("Ese servidor no es público: no se puede usar.");
  return { host, address: addresses[0]!.address };
}
