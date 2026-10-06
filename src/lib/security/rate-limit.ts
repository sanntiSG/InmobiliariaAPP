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

/** IP del cliente desde los headers del proxy (Netlify/Render ponen x-forwarded-for). */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim().slice(0, 45);
  return req.headers.get("x-real-ip")?.slice(0, 45) ?? "unknown";
}
