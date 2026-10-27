import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/connect";
import { PushSubscription } from "@/lib/db/models/PushSubscription";
import { requireUser } from "@/lib/auth/require-user";
import { limitOr429 } from "@/lib/security/rate-limit";
import { deviceLabel } from "@/lib/push/device";
import { areValidSubscriptionKeys, isKnownPushEndpoint } from "@/lib/push/endpoint";
import { PUSH_LIMITS } from "@/lib/push/send";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

const bodySchema = z.object({
  endpoint: z.string().max(600),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
  touchPoints: z.number().int().min(0).max(20).optional(),
});

/**
 * Guarda el dispositivo de quien inició sesión para enviarle avisos. Sólo con cuenta (los visitantes no tienen avisos). El
 * `endpoint` es único: si otra persona inicia sesión en el mismo dispositivo, la suscripción pasa a ella. Hasta 10 dispositivos
 * por persona (se borra el más viejo).
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Necesitás iniciar sesión para recibir avisos." }, { status: 401, headers: NO_STORE });
  const limited = await limitOr429(req, "push-subscribe", 30, 3600, { userId: user.id });
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isKnownPushEndpoint(parsed.data.endpoint) || !areValidSubscriptionKeys(parsed.data.keys)) {
    return NextResponse.json({ error: "Este dispositivo no es compatible con los avisos." }, { status: 400, headers: NO_STORE });
  }
  const { endpoint, keys, touchPoints } = parsed.data;

  try {
    await connectDB();
    await PushSubscription.updateOne(
      { endpoint },
      { $set: { userId: user.id, keys, device: deviceLabel(req.headers.get("user-agent") ?? "", { touchPoints }), failures: 0 }, $unset: { disabledAt: "" } },
      { upsert: true }
    );
    // Tope por persona: se conservan los más recientes.
    const mine = await PushSubscription.find({ userId: user.id }).sort({ updatedAt: -1 }).select("_id").lean();
    if (mine.length > PUSH_LIMITS.perUser) await PushSubscription.deleteMany({ _id: { $in: mine.slice(PUSH_LIMITS.perUser).map((m) => m._id) } });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (err) {
    console.error("POST /api/push/subscribe failed:", (err as Error)?.message);
    return NextResponse.json({ error: "No se pudo activar el aviso." }, { status: 503, headers: NO_STORE });
  }
}
