import { NextResponse } from "next/server";
import { z } from "zod";
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

    if (!parsed.data.channel) {
      await Agency.updateOne({ _id: scope.agencyId }, { $unset: { youtube: "" } });
      return NextResponse.json({ linked: false });
    }

    // Se resuelve el canal y se confirma que el feed responde antes de guardarlo.
    const channelId = await resolveChannelId(parsed.data.channel);
    const feed = await fetchChannelFeed(channelId);
    await Agency.updateOne(
      { _id: scope.agencyId },
      { $set: { "youtube.channelId": channelId, "youtube.channelTitle": feed.title.slice(0, 120) } }
    );
    return NextResponse.json({ linked: true, channelTitle: feed.title, videos: feed.videos.length });
  } catch (err) {
    if (err instanceof YouTubeError) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error("PUT /api/dashboard/agency/youtube failed:", err);
    return NextResponse.json({ error: "No se pudo vincular el canal." }, { status: 503 });
  }
}
