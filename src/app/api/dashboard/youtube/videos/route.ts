import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { agencyScope } from "@/lib/auth/agency-scope";
import { rateLimit } from "@/lib/security/rate-limit";
import { fetchChannelFeed, YouTubeError } from "@/lib/media/youtube-server";

/** Videos recientes del canal de YouTube vinculado a la inmobiliaria (para elegirlos en una publicación). */
export async function GET(req: NextRequest) {
  const access = await requireDashboardAccess();
  if (!access) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });
  const scope = agencyScope(access, req.nextUrl.searchParams.get("agencyId"));
  if (!scope?.agencyId) return NextResponse.json({ error: "Elegí una inmobiliaria." }, { status: 400 });

  const limit = await rateLimit(`yt:${access.userId}`, 30, 60);
  if (!limit.ok) return NextResponse.json({ error: "Demasiadas consultas seguidas." }, { status: 429 });

  try {
    await connectDB();
    const agency = await Agency.findById(scope.agencyId).select("youtube").lean();
    const channelId = agency?.youtube?.channelId;
    if (!channelId) return NextResponse.json({ linked: false, videos: [] });

    const feed = await fetchChannelFeed(channelId);
    return NextResponse.json({ linked: true, channelTitle: feed.title, videos: feed.videos });
  } catch (err) {
    if (err instanceof YouTubeError) return NextResponse.json({ error: err.message }, { status: 502 });
    console.error("GET /api/dashboard/youtube/videos failed:", err);
    return NextResponse.json({ error: "No se pudieron cargar los videos del canal." }, { status: 503 });
  }
}
