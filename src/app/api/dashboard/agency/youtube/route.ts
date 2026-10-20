import { NextResponse, after } from "next/server";
import { z } from "zod";
import { logActivity, touchAgencyData } from "@/lib/activity/log";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { agencyScope } from "@/lib/auth/agency-scope";
import { rateLimit } from "@/lib/security/rate-limit";
import { fetchChannelFeed, resolveChannelId, YouTubeError } from "@/lib/media/youtube-server";

const bodySchema = z.object({
  /** Link del canal, @handle o id `UC…`. Vacío = desvincular. */
  channel: z.string().trim().max(200),
  /** Sólo el admin: a qué inmobiliaria vincula el canal. */
  agencyId: z.string().length(24).optional(),
});

/** Vincula (o desvincula, con `channel` vacío) el canal de YouTube de la inmobiliaria. */
export async function PUT(req: Request) {
  const access = await requireDashboardAccess();
  if (!access) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });
  if (access.needsOnboarding) return NextResponse.json({ error: "Primero creá tu inmobiliaria." }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const scope = agencyScope(access, parsed.data.agencyId);
  if (!scope?.agencyId) return NextResponse.json({ error: "Elegí una inmobiliaria." }, { status: 400 });

  const limit = await rateLimit(`yt-link:${access.userId}`, 10, 60);
  if (!limit.ok) return NextResponse.json({ error: "Demasiados intentos. Esperá un momento." }, { status: 429 });

  try {
    await connectDB();

    const agencyId = scope.agencyId;
    const actor = { actorId: access.userId, actorRole: access.role };

    if (!parsed.data.channel) {
      const prev = await Agency.findOneAndUpdate({ _id: agencyId }, { $unset: { youtube: "" } }, { new: false })
        .select("youtube.channelTitle")
        .lean();
      // Sólo deja huella si de verdad había un canal vinculado.
      if (prev?.youtube?.channelId || prev?.youtube?.channelTitle) {
        touchAgencyData(agencyId);
        after(() =>
          logActivity({
            agencyId,
            ...actor,
            kind: "youtube_unlinked",
            changes: [{ field: "youtube", before: true, after: false, note: prev.youtube?.channelTitle ?? undefined }],
          })
        );
      }
      return NextResponse.json({ linked: false });
    }

    // Se resuelve el canal y se confirma que el feed responde antes de guardarlo.
    const channelId = await resolveChannelId(parsed.data.channel);
    const feed = await fetchChannelFeed(channelId);
    await Agency.updateOne(
      { _id: agencyId },
      { $set: { "youtube.channelId": channelId, "youtube.channelTitle": feed.title.slice(0, 120) } }
    );
    touchAgencyData(agencyId);
    after(() =>
      logActivity({
        agencyId,
        ...actor,
        kind: "youtube_linked",
        changes: [{ field: "youtube", before: false, after: true, note: feed.title.slice(0, 120) }],
      })
    );
    return NextResponse.json({ linked: true, channelTitle: feed.title, videos: feed.videos.length });
  } catch (err) {
    if (err instanceof YouTubeError) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error("PUT /api/dashboard/agency/youtube failed:", err);
    return NextResponse.json({ error: "No se pudo vincular el canal." }, { status: 503 });
  }
}
