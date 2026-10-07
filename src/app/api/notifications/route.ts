import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/connect";
import { AgencyDeletionNotice } from "@/lib/db/models/AgencyDeletionNotice";
import { Notification } from "@/lib/db/models/Notification";
import { requireUser } from "@/lib/auth/require-user";
import { maybeSendRecommendationNotifications } from "@/lib/intelligence/notify";
import { maybeAdvanceSocial } from "@/lib/social/engine";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });

  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 20)));

  // Recomendaciones nuevas, calculadas fuera de la respuesta (como mucho una
  // vez por día y sólo para quien explora; ver intelligence/notify.ts).
  if (user.role === "user") after(() => maybeSendRecommendationNotifications(user.id));
  // Quien gestiona una inmobiliaria: deja lista la publicación de redes del día.
  else if (user.agencyId) after(() => maybeAdvanceSocial(String(user.agencyId)));

  try {
    await connectDB();
    const email = (user.email ?? "").toLowerCase();
    const [items, unreadCount, celebration, deletion] = await Promise.all([
      Notification.find({ userId: user.id }).sort({ createdAt: -1 }).limit(limit).lean(),
      Notification.countDocuments({ userId: user.id, read: false }),
      // Felicitación de "permiso concedido": la más reciente sin leer. El
      // cliente la muestra como cartel y la marca leída al mostrarla, así
      // aparece una sola vez.
      Notification.findOne({ userId: user.id, type: "agency_approved", read: false })
        .sort({ createdAt: -1 })
        .select("title body href")
        .lean(),
      // Aviso "se eliminó tu inmobiliaria": atado al email porque la cuenta se
      // borró con la inmobiliaria. Se marca visto al mostrarlo (PATCH).
      email
        ? AgencyDeletionNotice.findOne({ email, seenAt: null }).sort({ deletedAt: -1 }).select("agencyName").lean()
        : null,
    ]);

    return NextResponse.json({
      celebration: celebration
        ? { id: String(celebration._id), title: celebration.title, body: celebration.body, href: celebration.href ?? "/" }
        : null,
      deletionNotice: deletion ? { id: String(deletion._id), agencyName: deletion.agencyName } : null,
      items: items.map((n) => ({
        id: String(n._id),
        type: n.type,
        title: n.title,
        body: n.body,
        href: n.href,
        read: n.read,
        createdAt: n.createdAt,
      })),
      unreadCount,
    });
  } catch (err) {
    console.error("GET /api/notifications failed:", err);
    return NextResponse.json({ error: "No se pudieron cargar tus notificaciones.", items: [], unreadCount: 0 }, { status: 503 });
  }
}

const patchSchema = z.object({
  ids: z.array(z.string().length(24)).optional(),
  all: z.boolean().optional(),
  deletionNoticeId: z.string().length(24).optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  try {
    await connectDB();
    if (parsed.data.deletionNoticeId) {
      // Sólo el aviso de ESTE email: nadie marca los de otras personas.
      await AgencyDeletionNotice.updateMany(
        { _id: parsed.data.deletionNoticeId, email: (user.email ?? "").toLowerCase() },
        { $set: { seenAt: new Date() } }
      );
      return NextResponse.json({ ok: true });
    }
    const filter = parsed.data.all
      ? { userId: user.id, read: false }
      : { userId: user.id, _id: { $in: parsed.data.ids ?? [] } };

    await Notification.updateMany(filter, { $set: { read: true } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/notifications failed:", err);
    return NextResponse.json({ error: "No se pudo actualizar." }, { status: 503 });
  }
}
