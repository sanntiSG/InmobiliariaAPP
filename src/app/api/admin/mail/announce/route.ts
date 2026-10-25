import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { Notification } from "@/lib/db/models/Notification";
import { getPublishedAgents } from "@/lib/advisor/config";
import { requireFreshAdmin } from "@/lib/auth/require-fresh-admin";
import { mailRuntime } from "@/lib/mail/runtime";
import { createNotificationForMany } from "@/lib/notifications/create";
import { limitOr429 } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
/** Una sola vez por persona: volver a tocar el botón no repite el aviso. */
const DEDUPE_KEY = "mail-announce:v1";

/**
 * "Avisar a las inmobiliarias": una notificación dentro de la plataforma a los dueños de las inmobiliarias activas, para que
 * sepan que ya pueden conectar su casilla de consultas. Sólo admin, sólo si el correo está activado y publicado para las
 * inmobiliarias, y no se repite.
 */
export async function POST(req: NextRequest) {
  const admin = await requireFreshAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401, headers: NO_STORE });
  const limited = await limitOr429(req, "admin-mail-announce", 5, 60 * 60, { userId: admin.id });
  if (limited) return limited;

  if (!mailRuntime().keyReady) return NextResponse.json({ error: "Primero cargá la clave de seguridad en Netlify." }, { status: 409, headers: NO_STORE });
  try {
    const published = await getPublishedAgents();
    if (!published.mail.enabled.agency) return NextResponse.json({ error: "Primero publicá el agente para “Inmobiliarias y admin”." }, { status: 409, headers: NO_STORE });

    await connectDB();
    const agencies = await Agency.find({ status: { $ne: "suspended" } }).select("owners").lean();
    const ownerIds = [...new Set(agencies.flatMap((a) => (a.owners ?? []).map(String)))];
    if (ownerIds.length === 0) return NextResponse.json({ notified: 0, total: 0 }, { headers: NO_STORE });

    const already = await Notification.countDocuments({ dedupeKey: DEDUPE_KEY, userId: { $in: ownerIds } });
    await createNotificationForMany(ownerIds, {
      type: "system",
      title: "El agente de correo ya está disponible",
      body: "Conectá la casilla donde recibís las consultas de tus clientes y te dejo las respuestas listas.",
      href: "/dashboard/agentes/correo",
      dedupeKey: DEDUPE_KEY,
    });
    return NextResponse.json({ notified: Math.max(0, ownerIds.length - already), total: ownerIds.length }, { headers: NO_STORE });
  } catch (err) {
    console.error("POST /api/admin/mail/announce failed:", (err as Error)?.message);
    return NextResponse.json({ error: "No se pudo enviar el aviso. Probá de nuevo." }, { status: 503, headers: NO_STORE });
  }
}
