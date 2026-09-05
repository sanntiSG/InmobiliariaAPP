import { NextResponse, after } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { propertyInputSchema } from "@/lib/validation/property";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { Property } from "@/lib/db/models/Property";
import { Favorite } from "@/lib/db/models/Favorite";
import { createNotificationForMany } from "@/lib/notifications/create";

const updateSchema = propertyInputSchema.omit({ agencyId: true }).extend({
  // Solo tiene efecto para un admin (reasignar la propiedad a otra
  // inmobiliaria); para dueños/agentes se ignora.
  agencyId: z.string().length(24).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireDashboardAccess();
  if (!access) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });
  if (access.needsOnboarding) {
    return NextResponse.json({ error: "Primero creá tu inmobiliaria en /publicar." }, { status: 403 });
  }

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    await connectDB();
    const scopeQuery = access.isAdmin ? { _id: id } : { _id: id, agencyId: access.agencyId };
    const property = await Property.findOne(scopeQuery);
    if (!property) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

    const { agencyId: requestedAgencyId, ...data } = parsed.data;

    if (access.isAdmin && requestedAgencyId && requestedAgencyId !== String(property.agencyId)) {
      const exists = await Agency.exists({ _id: requestedAgencyId });
      if (!exists) return NextResponse.json({ error: "Inmobiliaria inválida." }, { status: 400 });
      property.agencyId = new Types.ObjectId(requestedAgencyId);
    }

    const previousAmount = property.price?.amount;
    const priceChanged =
      data.price.amount !== property.price?.amount || data.price.currency !== property.price?.currency;
    const priceDropped = priceChanged && previousAmount != null && data.price.amount < previousAmount;

    property.set({ ...data, location: { type: "Point", coordinates: data.location } });

    if (priceChanged) {
      property.priceHistory?.push({ amount: data.price.amount, currency: data.price.currency, changedAt: new Date() });
    }
    if (data.status === "published" && !property.publishedAt) {
      property.publishedAt = new Date();
    }
    await property.save();

    if (priceDropped) {
      after(() => notifyPriceDrop(property));
    }

    return NextResponse.json({ id: String(property._id), slug: property.slug });
  } catch (err) {
    console.error("PATCH /api/dashboard/properties/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo actualizar la propiedad." }, { status: 503 });
  }
}

async function notifyPriceDrop(property: InstanceType<typeof Property>) {
  try {
    await connectDB();
    const favorites = await Favorite.find({ propertyId: property._id }).select("userId").lean();
    const userIds = favorites.map((f) => String(f.userId));
    await createNotificationForMany(userIds, {
      type: "price_drop",
      title: "Bajó el precio de una propiedad que guardaste",
      body: property.title,
      href: `/propiedades/${property.slug}`,
      propertyId: String(property._id),
    });
  } catch (err) {
    console.error("notifyPriceDrop failed:", err);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireDashboardAccess();
  if (!access) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });
  if (access.needsOnboarding) {
    return NextResponse.json({ error: "Primero creá tu inmobiliaria en /publicar." }, { status: 403 });
  }

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  try {
    await connectDB();
    const scopeQuery = access.isAdmin ? { _id: id } : { _id: id, agencyId: access.agencyId };
    const result = await Property.deleteOne(scopeQuery);
    if (result.deletedCount === 0) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/dashboard/properties/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo eliminar la propiedad." }, { status: 503 });
  }
}
