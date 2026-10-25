import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { promotionNote, rankForPromotion } from "@/lib/agents/knowledge/promote";
import { loadPortfolio } from "@/lib/advisor/data/portfolio";
import { SocialContent } from "@/lib/db/models/SocialContent";
import { socialAccess } from "@/lib/social/access";
import { eligibleProperties } from "@/lib/social/engine";
import type { SocialSuggestion } from "@/lib/social/types";
import { softLimitOr429 } from "@/lib/security/rate-limit";

const MAX_SUGGESTIONS = 3;

/**
 * Qué propiedades conviene promocionar hoy, con el motivo. Usa las mismas reglas que el asesor ("¿qué promociono?") sobre
 * las propiedades que tienen fotos para armar la publicación, y deja para el final las que se promocionaron hace poco.
 */
export async function GET(req: NextRequest) {
  const a = await socialAccess(req);
  if (a instanceof NextResponse) return a;
  const limited = softLimitOr429(req, "social-recommend", 30, 60);
  if (limited) return limited;

  try {
    await connectDB();
    const [portfolio, eligible, doc] = await Promise.all([
      loadPortfolio(a.agencyId),
      eligibleProperties(a.agencyId),
      SocialContent.findOne({ agencyId: a.agencyId }).select("recent.propertyIds").lean(),
    ]);
    const photos = new Map(eligible.map((e) => [e.id, e.photos[0]!]));
    const recent = doc?.recent?.propertyIds ?? [];
    // Los últimos tres que se promocionaron cuentan como "hace un día": no se vuelven a sugerir de inmediato.
    const promotedDaysAgo = new Map(recent.slice(-3).map((id) => [id, 1]));

    const ranked = rankForPromotion(
      portfolio.rows.filter((r) => photos.has(r.id)),
      portfolio.bench,
      new Date(),
      { promotedDaysAgo }
    )
      .filter((s) => !s.blocked)
      .slice(0, MAX_SUGGESTIONS);

    const items: SocialSuggestion[] = ranked.map((s) => ({
      id: s.r.id,
      title: s.r.title,
      photo: photos.get(s.r.id)!,
      reasons: s.reasons,
      note: promotionNote(s.reasons),
    }));
    return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("GET /api/dashboard/social/recommend failed:", err);
    return NextResponse.json({ error: "No se pudo preparar la recomendación." }, { status: 503 });
  }
}
