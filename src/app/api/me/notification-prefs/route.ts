import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/connect";
import { User } from "@/lib/db/models/User";
import { PushSubscription } from "@/lib/db/models/PushSubscription";
import { MUTABLE_GROUPS } from "@/config/notifications";
import { requireUser } from "@/lib/auth/require-user";
import { limitOr429 } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

const patchSchema = z
  .object({
    /** Grupos que NO quiere recibir (sólo los que se pueden silenciar: "sistema" siempre llega). */
    muted: z.array(z.enum(MUTABLE_GROUPS as unknown as [string, ...string[]])).max(MUTABLE_GROUPS.length),
    pushPaused: z.boolean(),
  })
  .partial()
  .strict();

async function view(userId: string) {
  const [u, devices] = await Promise.all([User.findById(userId).select("notificationPrefs").lean(), PushSubscription.find({ userId, disabledAt: null }).select("device updatedAt").sort({ updatedAt: -1 }).lean()]);
  return {
    muted: (u?.notificationPrefs?.muted ?? []).filter((g) => (MUTABLE_GROUPS as readonly string[]).includes(g)),
    pushPaused: !!u?.notificationPrefs?.pushPaused,
    devices: devices.map((d) => ({ id: String(d._id), label: d.device ?? "Dispositivo" })),
  };
}

/** Las preferencias de avisos de quien inició sesión y sus dispositivos. */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401, headers: NO_STORE });
  try {
    await connectDB();
    return NextResponse.json(await view(user.id), { headers: NO_STORE });
  } catch (err) {
    console.error("GET /api/me/notification-prefs failed:", (err as Error)?.message);
    return NextResponse.json({ error: "No se pudieron cargar tus preferencias." }, { status: 503, headers: NO_STORE });
  }
}

/** Cambia qué avisos quiere recibir. Sólo se pisan los campos que llegan. */
export async function PATCH(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401, headers: NO_STORE });
  const limited = await limitOr429(req, "notification-prefs", 60, 3600, { userId: user.id });
  if (limited) return limited;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Los datos no son válidos." }, { status: 400, headers: NO_STORE });
  const set: Record<string, unknown> = {};
  if (parsed.data.muted) set["notificationPrefs.muted"] = [...new Set(parsed.data.muted)];
  if (parsed.data.pushPaused !== undefined) set["notificationPrefs.pushPaused"] = parsed.data.pushPaused;
  try {
    await connectDB();
    if (Object.keys(set).length > 0) await User.updateOne({ _id: user.id }, { $set: set });
    return NextResponse.json(await view(user.id), { headers: NO_STORE });
  } catch (err) {
    console.error("PATCH /api/me/notification-prefs failed:", (err as Error)?.message);
    return NextResponse.json({ error: "No se pudieron guardar tus preferencias." }, { status: 503, headers: NO_STORE });
  }
}
