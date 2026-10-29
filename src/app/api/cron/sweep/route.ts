import { NextResponse, type NextRequest } from "next/server";
import { sweepEnabled } from "@/lib/cron/runtime";
import { runScheduledJobs } from "@/lib/cron/jobs";
import { sweepAvailability } from "@/lib/availability-sweep";
import { dispatchPending } from "@/lib/push/send";
import { rateLimit } from "@/lib/security/rate-limit";
import { sweepSecrets, verifyCronRequest } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Se corta a los 8 s (las funciones de Netlify duran ~10 s): lo que falte lo toma la próxima pasada. */
const BUDGET_MS = 8000;
/** Cada paso tiene su parte y al envío de avisos siempre le queda tiempo (es lo más sensible a la demora). */
const AVAILABILITY_MS = 3000;
const PUSH_RESERVE_MS = 2500;

/**
 * Tareas programadas que no dependen de que alguien esté navegando: avisar cuando un alquiler vuelve a estar disponible porque
 * terminó un período ocupado, las alertas del admin y oportunidades de cada inmobiliaria, y enviar los avisos del dispositivo
 * (push) que quedaron pendientes —porque el servidor que los creó no tenía las claves VAPID, o porque fallaron y toca reintentar—.
 * La llama la función programada de Netlify (cada 5 minutos) con una clave derivada de `AUTH_SECRET`; no depende de que el correo
 * esté configurado. Donde esas tareas no corren (Render) la ruta "no existe". Sólo responde conteos.
 */
export async function POST(req: NextRequest) {
  if (!sweepEnabled()) return new NextResponse(null, { status: 404 });
  if (!verifyCronRequest(req, sweepSecrets())) return new NextResponse(null, { status: 401 });
  const limit = await rateLimit("cron-sweep", 60, 300, { failOpen: false });
  if (!limit.ok) return new NextResponse(null, { status: 429 });

  try {
    const deadline = Date.now() + BUDGET_MS;
    const availability = await sweepAvailability(Math.min(deadline, Date.now() + AVAILABILITY_MS));
    // Alertas y oportunidades: un fallo acá no frena el envío de avisos.
    const jobs = await runScheduledJobs(deadline - PUSH_RESERVE_MS).catch((err) => {
      console.error("sweep jobs failed:", (err as Error)?.message);
      return null;
    });
    // Los avisos nuevos de arriba y todo lo que haya quedado pendiente. Un fallo del envío no afecta al resto de la tarea.
    const push = await dispatchPending({ deadline, limit: 200 }).catch((err) => {
      console.error("sweep push failed:", (err as Error)?.message);
      return null;
    });
    return NextResponse.json({ availability, jobs, push }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("POST /api/cron/sweep failed:", (err as Error)?.message);
    return new NextResponse(null, { status: 503 });
  }
}
