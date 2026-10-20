import { peekRateLimit, rateLimit } from "@/lib/security/rate-limit";
import type { AdvisorQuota } from "./types";

/** Preguntas gratis para quien no inició sesión (en total, no por día). */
export const ANON_LIMIT = 2;
/** Ventana larga: el cupo se renueva aproximadamente cada 60 días. */
const WINDOW_SEC = 60 * 24 * 3600;
/** Respaldo por IP contra quien borra la cookie para evadir el cupo (alto: varias personas comparten IP). */
const IP_LIMIT = 30;
const IP_WINDOW_SEC = 24 * 3600;

const ridKey = (rid: string) => `advisor-anon:rid:${rid}`;

const toQuota = (used: number): AdvisorQuota => ({
  limit: ANON_LIMIT,
  used: Math.min(used, ANON_LIMIT),
  remaining: Math.max(0, ANON_LIMIT - used),
  requiresAccount: used >= ANON_LIMIT,
});

/** Cupo actual de un visitante, sin consumir nada (para mostrar "te quedan N"). */
export async function peekAnonQuota(rid: string): Promise<AdvisorQuota> {
  return toQuota(await peekRateLimit(ridKey(rid), WINDOW_SEC));
}

/**
 * Consume una pregunta del cupo. Falla cerrado: si Mongo no responde, no se
 * regalan preguntas. Devuelve el estado DESPUÉS de consumir y si estaba permitido.
 */
export async function consumeAnonQuota(rid: string, ip: string): Promise<{ allowed: boolean; quota: AdvisorQuota }> {
  const [byVisitor, byIp] = await Promise.all([
    rateLimit(ridKey(rid), ANON_LIMIT, WINDOW_SEC, { failOpen: false }),
    rateLimit(`advisor-anon:ip:${ip}`, IP_LIMIT, IP_WINDOW_SEC, { failOpen: false }),
  ]);
  const used = ANON_LIMIT - byVisitor.remaining;
  const allowed = byVisitor.ok && byIp.ok;
  return { allowed, quota: allowed ? toQuota(used) : toQuota(ANON_LIMIT) };
}
