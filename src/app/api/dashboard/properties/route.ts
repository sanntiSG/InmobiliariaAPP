import { NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { propertyInputSchema } from "@/lib/validation/property";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { Property } from "@/lib/db/models/Property";
import { slugify } from "@/lib/utils/slugify";
import { findMatchingUsers } from "@/lib/notifications/match-users";
import { createNotificationForMany } from "@/lib/notifications/create";

const createSchema = propertyInputSchema.omit({ agencyId: true }).extend({
  // Solo se usa si quien publica es admin (sin inmobiliaria fija); para
  // dueños/agentes se ignora y se fuerza su propio agencyId.
  agencyId: z.string().length(24).optional(),
});

export async function POST(req: Request) {
  const access = await requireDashboardAccess();
  if (!access) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });
  if (access.needsOnboarding) {
    return NextResponse.json({ error: "Primero creá tu inmobiliaria en /publicar." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    await connectDB();

    let agencyId: string;
    if (access.isAdmin) {
      if (!parsed.data.agencyId) {
        return NextResponse.json({ error: "Elegí una inmobiliaria." }, { status: 400 });
      }
      const exists = await Agency.exists({ _id: parsed.data.agencyId });
      if (!exists) return NextResponse.json({ error: "Inmobiliaria inválida." }, { status: 400 });
      agencyId = parsed.data.agencyId;
    } else {
      agencyId = access.agencyId!;
    }

    const data = parsed.data;
    const slug = `${slugify(data.title)}-${Date.now().toString(36)}`;

    const property = await Property.create({
      ...data,
      agencyId,
      slug,
      location: { type: "Point", coordinates: data.location },
      priceHistory: [{ amount: data.price.amount, currency: data.price.currency, changedAt: new Date() }],
      publishedAt: data.status === "published" ? new Date() : undefined,
    });

    if (property.status === "published") {
      after(() => notifyMatchingUsers(property));
    }

    return NextResponse.json({ id: String(property._id), slug: property.slug }, { status: 201 });
  } catch (err) {
    console.error("POST /api/dashboard/properties failed:", err);
    return NextResponse.json({ error: "No se pudo crear la propiedad." }, { status: 503 });
  }
}

async function notifyMatchingUsers(property: InstanceType<typeof Property>) {
  try {
    await connectDB();
    const userIds = await findMatchingUsers({
      operation: property.operation,
      type: property.type,
      price: { amount: property.price!.amount },
      features: { rooms: property.features?.rooms ?? undefined },
      address: { neighborhood: property.address?.neighborhood ?? undefined },
    });
    await createNotificationForMany(userIds, {
      type: "new_match",
      title: "Nueva propiedad para vos",
      body: property.title,
      href: `/propiedades/${property.slug}`,
      propertyId: String(property._id),
    });
  } catch (err) {
    console.error("notifyMatchingUsers failed:", err);
  }
}
