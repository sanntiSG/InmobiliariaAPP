import { NextRequest, NextResponse, after } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { Property } from "@/lib/db/models/Property";
import { Agency } from "@/lib/db/models/Agency";
import { Lead } from "@/lib/db/models/Lead";
import { auth } from "@/auth";
import { inquirySchema } from "@/lib/validation/lead";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { recordEvent } from "@/lib/tracking/record";
import { createNotificationForMany } from "@/lib/notifications/create";
import { agencyMemberIds } from "@/lib/notifications/agency-members";
import { buildWhatsappLink } from "@/config/site";
import { brand } from "@/config/brand";

const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Consulta sobre una propiedad. Crea (o amplía) un lead de la inmobiliaria
 * dueña y le avisa dentro de la plataforma. Se puede consultar sin cuenta: la
 * persona deja su contacto en el formulario.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const parsed = inquirySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const data = parsed.data;
  // Honeypot: responder como si hubiera funcionado, sin guardar nada.
  if (data.website) return NextResponse.json({ ok: true }, { status: 201 });

  // Por IP (spam masivo) y por propiedad+IP (insistir sobre la misma publicación). Falla cerrado.
  const ip = clientIp(req);
  const [byIp, byProperty] = await Promise.all([
    rateLimit(`inquiry:ip:${ip}`, 8, 60 * 60, { failOpen: false }),
    rateLimit(`inquiry:prop:${id}:${ip}`, 3, 60 * 60, { failOpen: false }),
  ]);
  if (!byIp.ok || !byProperty.ok) {
    return NextResponse.json({ error: "Enviaste muchas consultas seguidas. Probá de nuevo más tarde." }, { status: 429 });
  }

  try {
    await connectDB();
    const property = await Property.findById(id).select("agencyId title slug status").lean();
    if (!property || property.status !== "published") {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    const session = await auth().catch(() => null);
    const userId = session?.user?.id ?? null;
    const email = data.email ? data.email.toLowerCase() : undefined;
    const phone = data.phone || undefined;

    // Mismo contacto sobre la misma propiedad en 24 h: se suma el mensaje al lead existente.
    const contactMatch = [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])];
    const existing = await Lead.findOne({
      agencyId: property.agencyId,
      propertyId: property._id,
      createdAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
      $or: contactMatch,
    });

    let leadId: string;
    let isNew = false;
    if (existing) {
      existing.messages.push({ text: data.message, at: new Date() });
      await existing.save();
      leadId = String(existing._id);
    } else {
      const lead = await Lead.create({
        agencyId: property.agencyId,
        propertyId: property._id,
        userId,
        name: data.name,
        email,
        phone,
        messages: [{ text: data.message, at: new Date() }],
        history: [{ status: "nuevo", at: new Date() }],
      });
      leadId = String(lead._id);
      isNew = true;
    }

    const agency = await Agency.findById(property.agencyId).select("owners contact.whatsapp").lean();
    const visitorId = req.cookies.get("rid")?.value ?? null;

    after(async () => {
      await recordEvent({
        type: "inquiry",
        propertyId: property._id,
        agencyId: property.agencyId,
        userId,
        anonId: visitorId,
      });
      if (!isNew) return;
      await createNotificationForMany(await agencyMemberIds(property.agencyId), {
        type: "lead",
        title: "Nueva consulta",
        body: `${data.name} consultó por «${property.title}»`,
        href: "/dashboard/clientes",
        propertyId: String(property._id),
        dedupeKey: `lead:${leadId}`,
      });
    });

    const whatsapp = agency?.contact?.whatsapp;
    return NextResponse.json(
      {
        ok: true,
        whatsappHref: whatsapp
          ? buildWhatsappLink(`Hola! Soy ${data.name}. Te escribo por "${property.title}" que vi en ${brand.name}: ${data.message}`, whatsapp)
          : null,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/properties/[id]/inquiries failed:", err);
    return NextResponse.json({ error: "No se pudo enviar la consulta. Intentá de nuevo." }, { status: 503 });
  }
}
