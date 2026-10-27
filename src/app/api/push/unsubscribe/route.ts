import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/connect";
import { PushSubscription } from "@/lib/db/models/PushSubscription";
import { requireUser } from "@/lib/auth/require-user";
import { limitOr429 } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

const bodySchema = z.object({ endpoint: z.string().max(600) });

/** Quita el dispositivo de quien lo pide (sólo el propio: un endpoint ajeno se ignora). Idempotente. */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401, headers: NO_STORE });
  const limited = await limitOr429(req, "push-subscribe", 30, 3600, { userId: user.id });
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Los datos no son válidos." }, { status: 400, headers: NO_STORE });
  try {
    await connectDB();
    await PushSubscription.deleteOne({ endpoint: parsed.data.endpoint, userId: user.id });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (err) {
    console.error("POST /api/push/unsubscribe failed:", (err as Error)?.message);
    return NextResponse.json({ error: "No se pudo desactivar el aviso." }, { status: 503, headers: NO_STORE });
  }
}
