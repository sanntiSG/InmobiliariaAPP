import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { RateLimit } from "@/lib/db/models/RateLimit";

type RateLimitResult = { ok: boolean; remaining: number };

/**
 * Rate limiting de ventana fija respaldado por Mongo (`$inc` atómico con
 * upsert). Funciona entre instancias serverless sin infraestructura extra.
 *
 * `failOpen` (por defecto true): si Mongo falla, se deja pasar — un corte de
 * base de datos no debería bloquear tracking ni navegación. Los endpoints
 * sensibles (consultas, solicitudes) pasan `failOpen: false`.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
  { failOpen = true }: { failOpen?: boolean } = {}
): Promise<RateLimitResult> {
  const windowMs = windowSec * 1000;
  const bucket = Math.floor(Date.now() / windowMs);
  const bucketKey = `${key}:${bucket}`;
  const expiresAt = new Date((bucket + 1) * windowMs + 60_000);

  try {
    await connectDB();
    const doc = await incrementBucket(bucketKey, expiresAt);
    const count = doc?.count ?? 1;
    return { ok: count <= limit, remaining: Math.max(0, limit - count) };
  } catch (err) {
    console.error("rateLimit failed:", err);
    return failOpen ? { ok: true, remaining: limit } : { ok: false, remaining: 0 };
  }
}

async function incrementBucket(key: string, expiresAt: Date) {
  const run = () =>
    RateLimit.findOneAndUpdate(
      { key },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true, new: true }
    ).lean();
  try {
    return await run();
  } catch (err) {
    // Dos requests simultáneos pueden intentar crear la misma fila (E11000):
    // el segundo reintento ya encuentra la fila y solo incrementa.
    if ((err as { code?: number }).code === 11000) return run();
    throw err;
  }
}

const TOO_MANY = {
  error: "Demasiadas solicitudes. Probá de nuevo en un momento.",
} as const;

function tooManyResponse(windowSec: number) {
  return NextResponse.json(TOO_MANY, { status: 429, headers: { "Retry-After": String(windowSec) } });
}

/**
 * Atajo para rutas: devuelve la respuesta 429 si se superó el límite, o `null`
 * para seguir. Cuenta por usuario (`userId`) o, si no hay, por IP. Respaldado
 * por Mongo, así que vale entre instancias — usalo donde el abuso cuesta
 * (APIs externas, almacenamiento, escrituras).
 */
export async function limitOr429(
  req: Request,
  scope: string,
  limit: number,
  windowSec: number,
  opts: { userId?: string; failOpen?: boolean } = {}
): Promise<NextResponse | null> {
  const key = opts.userId ? `${scope}:u:${opts.userId}` : `${scope}:ip:${clientIp(req)}`;
  const result = await rateLimit(key, limit, windowSec, { failOpen: opts.failOpen ?? true });
  return result.ok ? null : tooManyResponse(windowSec);
}

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

/**
 * Límite en memoria, sin viaje a la base: para lecturas públicas muy frecuentes
 * (mapa, listado) donde sumar una escritura por request costaría más que el
 * abuso que evita. Es por instancia (no global), suficiente para frenar una
 * ráfaga desde una misma IP.
 */
export function softLimitOr429(req: Request, scope: string, limit: number, windowSec: number): NextResponse | null {
  const now = Date.now();
  const key = `${scope}:${clientIp(req)}`;
  const bucket = memoryBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (memoryBuckets.size > 5000) {
      for (const [k, b] of memoryBuckets) if (b.resetAt <= now) memoryBuckets.delete(k);
    }
    memoryBuckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return null;
  }
  bucket.count += 1;
  return bucket.count > limit ? tooManyResponse(windowSec) : null;
}

/** IP del cliente desde los headers del proxy (Netlify/Render ponen x-forwarded-for). */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim().slice(0, 45);
  return req.headers.get("x-real-ip")?.slice(0, 45) ?? "unknown";
}
