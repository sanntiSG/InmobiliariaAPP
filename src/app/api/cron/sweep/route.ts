import { NextResponse, type NextRequest } from "next/server";
import { pollerEnabled } from "@/lib/mail/access";
import { sweepAvailability } from "@/lib/availability-sweep";
import { dispatchPending } from "@/lib/push/send";
import { rateLimit } from "@/lib/security/rate-limit";
import { verifyCronRequest } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Se corta a los 8 s (las funciones de Netlify duran ~10 s): lo que falte lo toma la próxima pasada. */
const BUDGET_MS = 8000;

/**
 * Tareas programadas que no dependen de que alguien esté navegando: avisar cuando un alquiler vuelve a estar disponible porque
 * terminó un período ocupado y enviar los avisos del dispositivo (push) que quedaron pendientes —porque el servidor que los creó no
 * tenía las claves VAPID, o porque fallaron y toca reintentar—. La llama la misma función programada de Netlify que revisa el correo (cada 5 minutos, con
 * la misma clave derivada), así no hace falta otra función ni otro ping. Donde esas tareas no corren (Render) la ruta "no
 * existe". Sólo responde conteos.
 */
export async function POST(req: NextRequest) {
  if (!pollerEnabled()) return new NextResponse(null, { status: 404 });
  if (!verifyCronRequest(req)) return new NextResponse(null, { status: 401 });
  const limit = await rateLimit("cron-sweep", 60, 300, { failOpen: false });
  if (!limit.ok) return new NextResponse(null, { status: 429 });

  try {
    const deadline = Date.now() + BUDGET_MS;
    const availability = await sweepAvailability(deadline);
    // Los avisos nuevos de arriba y todo lo que haya quedado pendiente. Un fallo del envío no afecta al resto de la tarea.
    const push = await dispatchPending({ deadline, limit: 200 }).catch((err) => {
      console.error("sweep push failed:", (err as Error)?.message);
      return null;
    });
    return NextResponse.json({ availability, push }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("POST /api/cron/sweep failed:", (err as Error)?.message);
    return new NextResponse(null, { status: 503 });
  }
}
