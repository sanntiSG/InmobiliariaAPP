import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { Property } from "@/lib/db/models/Property";
import { socialAccess } from "@/lib/social/access";
import { ensureToday } from "@/lib/social/engine";
import { renderPost } from "@/lib/social/render";
import { softLimitOr429 } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

/** PNG 1080×1350 de la publicación (`slot=current|next`). `download=1` fuerza la descarga. */
export async function GET(req: NextRequest) {
  const a = await socialAccess(req);
  if (a instanceof NextResponse) return a;
  const limited = softLimitOr429(req, "social-image", 60, 60);
  if (limited) return limited;

  const slot = req.nextUrl.searchParams.get("slot") === "next" ? "next" : "current";
  try {
    const doc = await ensureToday(a.agencyId);
    const r = slot === "next" ? doc.next : doc.current;
    if (!r) return NextResponse.json({ error: "No hay publicación." }, { status: 404 });

    await connectDB();
    const [property, agency] = await Promise.all([
      Property.findOne({ _id: r.propertyId, agencyId: a.agencyId, status: "published" })
        .select("slug type operation price address features")
        .lean(),
      Agency.findById(a.agencyId).select("name logo branding").lean(),
    ]);
    if (!property || !agency) return NextResponse.json({ error: "No hay publicación." }, { status: 404 });

    const img = await renderPost({ property, agency, photoUrl: r.photoUrl, templateId: r.templateId });
    if (!img) return NextResponse.json({ error: "No se pudo leer la foto." }, { status: 422 });

    const headers = new Headers({ "Content-Type": "image/png", "Cache-Control": "private, no-store" });
    if (req.nextUrl.searchParams.get("download") === "1") {
      const day = new Date().toISOString().slice(0, 10);
      const slug = String(property.slug).replace(/[^a-z0-9-]/gi, "").slice(0, 60);
      headers.set("Content-Disposition", `attachment; filename="publicacion-${slug}-${day}.png"`);
    }
    return new Response(img.body, { headers });
  } catch (err) {
    console.error("GET /api/dashboard/social/image failed:", err);
    return NextResponse.json({ error: "No se pudo generar la imagen." }, { status: 503 });
  }
}
