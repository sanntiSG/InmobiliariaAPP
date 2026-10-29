/**
 * Un cerrojo con hora compartido entre todos los servidores: "esta tarea ya corrió hace menos de X". Sirve para que una tarea
 * programada no se repita en cada pasada (cada 5 minutos) ni la hagan dos servidores a la vez. Se apoya en `ServiceHeartbeat`
 * (un documento por clave, clave única): reclamar es una sola operación atómica. `memo` no sirve para esto porque vive en la memoria
 * de UNA instancia, y en un servicio sin estado cada llamada puede caer en otra.
 */
import { ServiceHeartbeat } from "@/lib/db/models/ServiceHeartbeat";

/** `true` si esta llamada se quedó con el turno (y ya lo dejó anotado); `false` si otra corrió hace menos de `everyMs`. */
export async function claimSlot(key: string, everyMs: number, now: Date = new Date()): Promise<boolean> {
  try {
    const doc = await ServiceHeartbeat.findOneAndUpdate(
      { key, $or: [{ lastRunAt: null }, { lastRunAt: { $lt: new Date(now.getTime() - everyMs) } }] },
      { $set: { lastRunAt: now } },
      { upsert: true, returnDocument: "after", projection: { key: 1 } }
    );
    return !!doc;
  } catch (err) {
    // Clave duplicada: el documento existe y su última corrida es reciente (el filtro no lo encontró y el alta chocó).
    if ((err as { code?: number })?.code === 11000) return false;
    throw err;
  }
}

/** Cuándo corrió por última vez cada una de estas claves (las que nunca corrieron no figuran). */
export async function lastRuns(keys: string[]): Promise<Map<string, number>> {
  if (keys.length === 0) return new Map();
  const rows = await ServiceHeartbeat.find({ key: { $in: keys } }).select("key lastRunAt").lean();
  return new Map(rows.filter((r) => r.lastRunAt).map((r) => [r.key, new Date(r.lastRunAt as Date).getTime()]));
}
