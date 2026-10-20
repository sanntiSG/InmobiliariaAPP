import { NextResponse, after } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { propertyInputSchema } from "@/lib/validation/property";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { Property } from "@/lib/db/models/Property";
import { Favorite } from "@/lib/db/models/Favorite";
import { Like } from "@/lib/db/models/Like";
import { Comment } from "@/lib/db/models/Comment";
import { Rating } from "@/lib/db/models/Rating";
import { createNotificationForMany } from "@/lib/notifications/create";
import { notifyNewPublication } from "@/lib/notifications/new-property";
import { PropertyDailyStat } from "@/lib/db/models/PropertyDailyStat";
import { diffProperty, snapshotProperty } from "@/lib/activity/diff";
import { logActivity, touchAgencyData } from "@/lib/activity/log";

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

    // Foto de cómo estaba antes de editar: la bitácora del asesor compara contra esto.
    const beforeSnapshot = snapshotProperty(property.toObject());
    const previousAgencyId = String(property.agencyId);

    if (access.isAdmin && requestedAgencyId && requestedAgencyId !== String(property.agencyId)) {
      const exists = await Agency.exists({ _id: requestedAgencyId });
      if (!exists) return NextResponse.json({ error: "Inmobiliaria inválida." }, { status: 400 });
      property.agencyId = new Types.ObjectId(requestedAgencyId);
    }

    const previousAmount = property.price?.amount;
    const sameCurrency = data.price.currency === property.price?.currency;
    const priceChanged = data.price.amount !== property.price?.amount || !sameCurrency;
    // Sólo cuenta como baja si la moneda no cambió: pasar de ARS a USD no es una rebaja.
    const priceDropped = priceChanged && sameCurrency && previousAmount != null && data.price.amount < previousAmount;

    property.set({ ...data, location: { type: "Point", coordinates: data.location } });

    if (priceChanged) {
      property.priceHistory?.push({ amount: data.price.amount, currency: data.price.currency, changedAt: new Date() });
    }
    // Primera vez que se publica (alta como borrador y publicación recién ahora, por ejemplo).
    const firstPublish = data.status === "published" && !property.publishedAt;
    if (firstPublish) {
      property.publishedAt = new Date();
    }
    await property.save();

    if (priceDropped) {
      after(() => notifyPriceDrop(property));
    }
    if (firstPublish) {
      after(() => notifyNewPublication(property));
    }

    // Bitácora para el asesor + caché de inteligencia al día (de la agencia nueva y, si el
    // admin reasignó la propiedad, también de la anterior).
    const agencyId = String(property.agencyId);
    const changes = diffProperty(beforeSnapshot, snapshotProperty(property.toObject()));
    if (agencyId !== previousAgencyId) {
      changes.push({ field: "agency", note: "Propiedad reasignada desde otra inmobiliaria" });
      touchAgencyData(previousAgencyId);
    }
    touchAgencyData(agencyId);
    after(() =>
      logActivity({
        agencyId,
        propertyId: String(property._id),
        propertyTitle: property.title,
        actorId: access.userId,
        actorRole: access.role,
        kind: "property_updated",
        changes,
      })
    );

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
    const deleted = await Property.findOneAndDelete(scopeQuery).select("agencyId title").lean();
    if (!deleted) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

    // Sin esto quedaban Like/Favorite/Rating/Comment huérfanos apuntando a
    // un `propertyId` que ya no existe — nunca se limpiaban solos.
    await Promise.all([
      Like.deleteMany({ propertyId: id }),
      Favorite.deleteMany({ propertyId: id }),
      Rating.deleteMany({ propertyId: id }),
      Comment.deleteMany({ propertyId: id }),
      // Sus métricas diarias ya no tienen a quién pertenecer (los clientes potenciales se conservan).
      PropertyDailyStat.deleteMany({ propertyId: id }),
    ]);

    const agencyId = String(deleted.agencyId);
    touchAgencyData(agencyId);
    after(() =>
      logActivity({
        agencyId,
        propertyId: id,
        propertyTitle: deleted.title,
        actorId: access.userId,
        actorRole: access.role,
        kind: "property_deleted",
      })
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/dashboard/properties/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo eliminar la propiedad." }, { status: 503 });
  }
}
