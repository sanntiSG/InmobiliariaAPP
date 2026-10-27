import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { PushSubscription } from "@/lib/db/models/PushSubscription";
import { requireUser } from "@/lib/auth/require-user";
import { limitOr429 } from "@/lib/security/rate-limit";
import { createNotification } from "@/lib/notifications/create";
import { vapidConfig } from "@/lib/push/vapid";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * "Enviarme un aviso de prueba": crea una notificación común (así pasa por el mismo camino que todas) para que la persona
 * compruebe que le llega al dispositivo. Dice con honestidad si este servidor puede enviarla ya o si la manda la tarea programada.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401, headers: NO_STORE });
  const limited = await limitOr429(req, "push-test", 5, 600, { userId: user.id });
  if (limited) return limited;
  try {
    await connectDB();
    const devices = await PushSubscription.countDocuments({ userId: user.id, disabledAt: null });
    if (devices === 0) return NextResponse.json({ error: "Todavía no activaste los avisos en ningún dispositivo." }, { status: 409, headers: NO_STORE });
    await createNotification({ userId: user.id, type: "system", title: "Aviso de prueba", body: "Si lo ves en tu dispositivo, los avisos funcionan.", href: "/notificaciones" });
    // Con claves en este servidor sale en el momento; sin ellas la envía la tarea programada (hasta ~5 minutos).
    return NextResponse.json({ ok: true, immediate: !!vapidConfig() }, { headers: NO_STORE });
  } catch (err) {
    console.error("POST /api/push/test failed:", (err as Error)?.message);
    return NextResponse.json({ error: "No se pudo enviar la prueba." }, { status: 503, headers: NO_STORE });
  }
}
