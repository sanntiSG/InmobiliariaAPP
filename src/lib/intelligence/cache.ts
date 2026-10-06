type Entry = { expiresAt: number; value: Promise<unknown> };

const store = new Map<string, Entry>();
const MAX_ENTRIES = 200;

/**
 * Caché en memoria con TTL para cálculos pesados y poco cambiantes (benchmarks
 * de la plataforma, co-ocurrencias). Comparte la promesa en vuelo, así que
 * varias requests simultáneas calculan una sola vez. Es por instancia: en
 * serverless se enfría solo — alcanza, porque el costo que evita es el de
 * recalcular en ráfagas, no el de mantener un estado global exacto.
 */
export async function memo<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) return hit.value as Promise<T>;

  if (store.size >= MAX_ENTRIES) {
    for (const [k, v] of store) if (v.expiresAt <= now) store.delete(k);
    if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value as string);
  }

  const value = compute();
  store.set(key, { expiresAt: now + ttlMs, value });
  // Un fallo no se cachea: el próximo llamado reintenta.
  value.catch(() => store.delete(key));
  return value;
}
