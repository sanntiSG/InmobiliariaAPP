/**
 * Se ejecuta una sola vez al arrancar una instancia del server (ver
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation).
 * La usamos para "despertar" la conexión a MongoDB Atlas ANTES de que llegue
 * el primer request real: sin esto, quien entra primero a /mapa paga el cold
 * start del cluster (DNS SRV + TCP + TLS + SCRAM, 1.5-5s en un tier M0)
 * mientras mira los skeletons. `connectDB()` ya cachea la conexión en
 * `globalThis`, así que este pre-warm y el primer request comparten la misma
 * promesa si llegan a pisarse.
 *
 * No debe ser fatal: si la DB está mal configurada o inalcanzable en este
 * momento, preferimos loguearlo y dejar que el server arranque igual (cada
 * request seguirá intentando conectar por su cuenta) antes que tirar abajo
 * el arranque entero por un problema de red transitorio.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { connectDB } = await import("@/lib/db/connect");
    await connectDB();
  } catch (err) {
    console.error("Pre-warm de MongoDB falló (se reintentará por request):", err);
  }
}
