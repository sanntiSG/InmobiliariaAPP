/**
 * Cuándo toca revisar un buzón. La función programada de Netlify llama cada 5 minutos pero nunca a la misma hora exacta
 * (cae unos segundos después del minuto, según el arranque en frío), y `pollMailbox` agenda la próxima revisión a
 * "5 minutos desde que empezó". Sin margen, la pasada siguiente llegaba un poco ANTES de ese instante, no encontraba el
 * buzón vencido y lo salteaba: en la práctica se revisaba cada ~10 minutos. Por eso el cron toma lo que vence "en un rato".
 *
 * Módulo puro (sin base de datos ni React): lo leen la ruta del cron, el pipeline y las pruebas.
 */

/** Cada cuánto se vuelve a revisar un buzón que anda bien (es también el ritmo de la función programada). */
export const POLL_EVERY_MS = 5 * 60_000;

/** Cuánto antes de su hora se considera "vencido" un buzón: cubre el desfase de la función programada. */
export const SCHEDULE_SLACK_MS = 90_000;

/** ¿Le toca la revisión a un buzón cuya próxima revisión es `nextPollAt`? Sin fecha (recién conectado) toca ya. */
export function isDue(nextPollAt: Date | string | number | null | undefined, now: number = Date.now()): boolean {
  if (nextPollAt === null || nextPollAt === undefined) return true;
  const at = new Date(nextPollAt).getTime();
  if (Number.isNaN(at)) return true;
  return at <= now + SCHEDULE_SLACK_MS;
}

/** El mismo criterio de `isDue` como filtro de Mongo, más el estado y el bloqueo (una revisión en curso no se repite). */
export function dueFilter(now: number = Date.now()) {
  return {
    status: { $in: ["active", "error"] as Array<"active" | "error"> },
    $or: [{ nextPollAt: null }, { nextPollAt: { $lte: new Date(now + SCHEDULE_SLACK_MS) } }],
    lockedUntil: { $not: { $gt: new Date(now) } },
  };
}

/**
 * Cuándo va a pasar la próxima revisión automática: la primera pasada programada (múltiplos de 5 minutos del reloj, que es
 * cuando corre la función de Netlify) a partir de que el buzón esté vencido. Si el buzón está esperando por un error, la
 * espera manda. Es una estimación para mostrar en pantalla ("en ~3 min"), no una garantía.
 */
export function nextAutoCheckAt(nextPollAt: Date | string | number | null | undefined, now: number = Date.now()): number {
  const due = nextPollAt === null || nextPollAt === undefined ? NaN : new Date(nextPollAt).getTime();
  const from = Math.max(now, Number.isNaN(due) ? now : due - SCHEDULE_SLACK_MS);
  return Math.ceil(from / POLL_EVERY_MS) * POLL_EVERY_MS;
}
