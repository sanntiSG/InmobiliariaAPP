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
import { notifyNewMedia, notifyPriceChange, notifyUnavailable } from "@/lib/notifications/property-events";
import { mediaFingerprint, newMediaKinds, type UnavailableStatus } from "@/lib/notifications/social-text";
import { notifyNewPublication } from "@/lib/notifications/new-property";
import { PropertyDailyStat } from "@/lib/db/models/PropertyDailyStat";
import { diffProperty, snapshotProperty } from "@/lib/activity/diff";
import { logActivity, touchAgencyData } from "@/lib/activity/log";
import { AmbientSelectionError, markAmbientAttached, resolveAmbient, type StoredAmbient } from "@/lib/ambient/attach";
import { releaseCover } from "@/lib/ambient/server";
import { AvailabilityWatch } from "@/lib/db/models/AvailabilityWatch";
import { effectivePeriod, isRentalOperation } from "@/config/pricing";
import { notifyPropertyAvailable } from "@/lib/notifications/availability";
import { normalizeRentalFields } from "@/lib/properties/normalize";

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
    // Cómo estaba antes, para avisar a quien le importa lo que cambió (precio, que ya no está disponible, fotos nuevas).
    const previousStatus = property.status;
    const wasManuallyUnavailable = property.availability?.state === "unavailable";
    const mediaBefore = mediaFingerprint(property.toObject().media);

    if (access.isAdmin && requestedAgencyId && requestedAgencyId !== String(property.agencyId)) {
      const exists = await Agency.exists({ _id: requestedAgencyId });
      if (!exists) return NextResponse.json({ error: "Inmobiliaria inválida." }, { status: 400 });
      property.agencyId = new Types.ObjectId(requestedAgencyId);
    }

    // Período del precio válido para la operación, equivalente por noche y disponibilidad (sólo alquileres): lo decide el servidor.
    const norm = normalizeRentalFields(data);
    const previousAmount = property.price?.amount;
    const sameCurrency = data.price.currency === property.price?.currency;
    // Pasar de "por noche" a "por semana" (o de mes a noche) cambia el monto sin ser una rebaja: sólo se compara dentro del mismo período.
    const samePeriod = norm.price.period === effectivePeriod(property.operation, property.price?.period);
    const priceChanged = data.price.amount !== property.price?.amount || !sameCurrency;
    // Sólo cuenta como baja o suba si la moneda y el período no cambiaron: pasar de ARS a USD no es una rebaja.
    const priceMoved = priceChanged && sameCurrency && samePeriod && previousAmount != null && data.price.amount !== previousAmount;
    // Un alquiler que no estaba disponible y ahora sí (la inmobiliaria lo liberó): se avisa a quien lo esperaba.
    const wasUnavailable = property.availability?.current === "unavailable";

    // Portada viva: el navegador sólo manda cuál; el resto sale de la portada que el servidor ya verificó.
    const previousCoverId = property.media?.ambient?.coverId ?? undefined;
    const { ambient: ambientSelection, ...mediaRest } = data.media;
    let ambient: StoredAmbient | null;
    try {
      ambient = await resolveAmbient({ agencyId: String(property.agencyId), propertyId: String(property._id), selection: ambientSelection });
    } catch (err) {
      if (err instanceof AmbientSelectionError) return NextResponse.json({ error: err.message }, { status: 400 });
      throw err;
    }

    property.set({
      ...data,
      status: norm.status,
      price: norm.price,
      availability: norm.availability,
      media: { ...mediaRest, ...(ambient ? { ambient } : {}), hasAmbientCover: !!ambient },
      location: { type: "Point", coordinates: data.location },
    });
    if (!ambient) property.set("media.ambient", undefined);

    if (priceChanged) {
      property.priceHistory?.push({ amount: data.price.amount, currency: data.price.currency, changedAt: new Date() });
    }
    // Primera vez que se publica (alta como borrador y publicación recién ahora, por ejemplo).
    const firstPublish = norm.status === "published" && !property.publishedAt;
    if (firstPublish) {
      property.publishedAt = new Date();
    }
    await property.save();

    // La portada que ya no se usa (quitada o reemplazada) libera sus archivos; la nueva queda marcada como en uso.
    if (ambient) await markAmbientAttached(ambient.coverId, String(property._id));
    if (previousCoverId && previousCoverId !== ambient?.coverId) after(() => releaseCover(previousCoverId));

    if (property.status === "published" && priceMoved && previousAmount != null) {
      const before = { amount: previousAmount, currency: data.price.currency };
      const next = { amount: data.price.amount, currency: data.price.currency };
      after(() => notifyPriceChange(property, data.price.amount < previousAmount ? "drop" : "up", before, next, norm.price.period));
    }
    if (previousStatus === "published" && !firstPublish) {
      // Venta: pasó a vendida o reservada. Alquiler: sigue publicada (en rojo) y lo que cambia es su disponibilidad.
      if (property.status === "sold" || property.status === "reserved" || property.status === "rented") {
        const status = property.status as UnavailableStatus;
        after(() => notifyUnavailable(property, status));
      } else if (property.status === "published" && isRentalOperation(property.operation) && !wasManuallyUnavailable && norm.availability.state === "unavailable") {
        const status: UnavailableStatus = data.status === "reserved" ? "reserved" : "rented";
        after(() => notifyUnavailable(property, status));
      }
      // Fotos, video o recorrido sumados a una propiedad que ya estaba publicada (quitar no avisa).
      if (property.status === "published") {
        const kinds = newMediaKinds(mediaBefore, mediaFingerprint(property.toObject().media));
        if (kinds.length > 0) after(() => notifyNewMedia(property, kinds));
      }
    }
    if (firstPublish) {
      after(() => notifyNewPublication(property));
    }
    if (wasUnavailable && norm.availability.current === "available" && property.status === "published") {
      after(() => notifyPropertyAvailable(property));
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
    const deleted = await Property.findOneAndDelete(scopeQuery).select("agencyId title media.ambient.coverId").lean();
    if (!deleted) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

    // Su portada viva (si tenía) ya no tiene a quién pertenecer: se borran sus archivos.
    after(() => releaseCover(deleted.media?.ambient?.coverId));

    // Sin esto quedaban Like/Favorite/Rating/Comment huérfanos apuntando a
    // un `propertyId` que ya no existe — nunca se limpiaban solos.
    await Promise.all([
      Like.deleteMany({ propertyId: id }),
      Favorite.deleteMany({ propertyId: id }),
      Rating.deleteMany({ propertyId: id }),
      Comment.deleteMany({ propertyId: id }),
      AvailabilityWatch.deleteMany({ propertyId: id }),
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
