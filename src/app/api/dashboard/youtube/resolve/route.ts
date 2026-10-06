import { NextRequest, NextResponse } from "next/server";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { rateLimit } from "@/lib/security/rate-limit";
import { parseYouTubeVideoUrl } from "@/lib/media/youtube";
import { resolveVideo, YouTubeError } from "@/lib/media/youtube-server";

/**
 * Valida un link de video pegado a mano: que sea de YouTube, que exista y se
 * pueda incrustar, y trae su título. Sólo se usa el id extraído del link: la
 * consulta a YouTube se arma con un host fijo.
 */
export async function GET(req: NextRequest) {
  const access = await requireDashboardAccess();
  if (!access) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });

  const limit = await rateLimit(`yt:${access.userId}`, 30, 60);
  if (!limit.ok) return NextResponse.json({ error: "Demasiadas consultas seguidas." }, { status: 429 });

  const parsed = parseYouTubeVideoUrl(req.nextUrl.searchParams.get("url") ?? "");
  if (!parsed) {
    return NextResponse.json(
      { error: "Pegá un link de YouTube válido (youtube.com/watch…, youtu.be/… o youtube.com/shorts/…)." },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(await resolveVideo(parsed.videoId, parsed.orientation));
  } catch (err) {
    if (err instanceof YouTubeError) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error("GET /api/dashboard/youtube/resolve failed:", err);
    return NextResponse.json({ error: "No se pudo verificar el video." }, { status: 503 });
  }
}
