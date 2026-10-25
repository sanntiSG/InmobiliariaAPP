import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { Property } from "@/lib/db/models/Property";
import { toFacts } from "@/lib/agents/knowledge/facts";
import { socialAccess } from "@/lib/social/access";
import { buildCaption, captionToString } from "@/lib/social/caption";
import { ensureToday } from "@/lib/social/engine";
import type { SocialCaptionPayload } from "@/lib/social/types";
import { softLimitOr429 } from "@/lib/security/rate-limit";
import { getSiteOrigin } from "@/lib/site-url";

/** Texto y hashtags sugeridos para la publicación de hoy (reglas, sin IA). Cambian cuando cambia la publicación. */
export async function GET(req: NextRequest) {
  const a = await socialAccess(req);
  if (a instanceof NextResponse) return a;
  const limited = softLimitOr429(req, "social-caption", 60, 60);
  if (limited) return limited;

  try {
    const doc = await ensureToday(a.agencyId);
    const r = doc.current;
    if (!r) return NextResponse.json({ error: "No hay publicación." }, { status: 404 });

    await connectDB();
    const [property, agency] = await Promise.all([
      Property.findOne({ _id: r.propertyId, agencyId: a.agencyId, status: "published" })
        .select("slug title description type operation price address features amenities media.hasTour3d media.hasAmbientCover media.videos")
        .lean(),
      Agency.findById(a.agencyId).select("name").lean(),
    ]);
    if (!property || !agency) return NextResponse.json({ error: "No hay publicación." }, { status: 404 });

    const origin = await getSiteOrigin();
    const caption = buildCaption(toFacts(property), {
      agencyName: agency.name,
      seed: `${r.propertyId}:${r.version ?? 1}`,
      url: `${origin}/propiedades/${encodeURIComponent(String(property.slug))}`,
    });
    const body: SocialCaptionPayload = { ...caption, full: captionToString(caption) };
    return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("GET /api/dashboard/social/caption failed:", err);
    return NextResponse.json({ error: "No se pudo preparar el texto." }, { status: 503 });
  }
}
