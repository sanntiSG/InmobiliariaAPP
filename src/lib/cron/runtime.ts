/**
 * ¿Este despliegue corre las tareas programadas de la plataforma (`/api/cron/sweep`)? La web principal (Netlify) sí; la de respaldo
 * (Render) no: ahí la ruta "no existe". NO depende del correo: avisos del dispositivo, "se liberó" y alertas funcionan aunque nadie
 * haya conectado una casilla. `SWEEP_ENABLED` sólo existe para forzar ("true" enciende, "false" apaga). Función pura.
 */
type Env = Record<string, string | undefined>;

export function sweepEnabled(env: Env = process.env): boolean {
  if (env.SWEEP_ENABLED === "true") return true;
  if (env.SWEEP_ENABLED === "false") return false;
  return env.RENDER !== "true";
}
