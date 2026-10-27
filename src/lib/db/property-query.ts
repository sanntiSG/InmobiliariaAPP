import { Types } from "mongoose";
import { RECENT_DAYS } from "@/lib/filters/state";
import { RENTAL_OPERATIONS } from "@/config/pricing";
import { checkRange } from "@/lib/availability";

type BaseFilters = {
  q?: string;
  operation?: string;
  type?: string[];
  priceMin?: number;
  priceMax?: number;
  minRooms?: number;
  amenities?: string[];
  tour3d?: boolean;
  agencyId?: string;
  currency?: string;
  minBedrooms?: number;
  minBathrooms?: number;
  minGarages?: number;
  areaMin?: number;
  areaMax?: number;
  city?: string;
  neighborhood?: string;
  ambient?: boolean;
  videos?: boolean;
  recent?: boolean;
  /** Hasta cuántos metros de la playa. */
  beach?: number;
  /** Libre durante todo el rango (días `YYYY-MM-DD`): sólo alquileres. */
  from?: string;
  to?: string;
};

/** Filtro Mongo compartido entre /api/map/properties y /api/properties. */
export function buildPropertyQuery(filters: BaseFilters): Record<string, unknown> {
  const query: Record<string, unknown> = { status: "published" };

  if (filters.operation) query.operation = filters.operation;
  if (filters.type && filters.type.length > 0) query.type = { $in: filters.type };
  if (filters.amenities && filters.amenities.length > 0) query.amenities = { $all: filters.amenities };
  if (filters.tour3d) query["media.hasTour3d"] = true;
  if (filters.minRooms) query["features.rooms"] = { $gte: filters.minRooms };
  // El precio sólo se compara DENTRO de una operación: un monto por noche, uno por mes y uno de venta no se parecen. Sin operación
  // elegida no se filtra por precio (la pantalla ni siquiera lo ofrece). En un alquiler temporal se compara el equivalente por noche
  // (semana ÷ 7, quincena ÷ 15, mes ÷ 30; ver `config/pricing.ts`), así lo cobrado por semana y lo cobrado por noche se pueden comparar.
  const priced = !!filters.operation && (filters.priceMin != null || filters.priceMax != null);
  if (priced) {
    query[filters.operation === "alquiler_temporal" ? "price.perNight" : "price.amount"] = {
      ...(filters.priceMin != null ? { $gte: filters.priceMin } : {}),
      ...(filters.priceMax != null ? { $lte: filters.priceMax } : {}),
    };
  }
  if (filters.agencyId && Types.ObjectId.isValid(filters.agencyId)) {
    query.agencyId = new Types.ObjectId(filters.agencyId);
  }
  // La moneda sólo acota junto con un rango de precio. Sola no es un filtro que la persona pueda ver ni quitar, y antes dejaba
  // en cero, por ejemplo, los alquileres en pesos cuando quedaba elegida "Dólares" sin precio.
  if (filters.currency && priced) query["price.currency"] = filters.currency;
  if (filters.minBedrooms) query["features.bedrooms"] = { $gte: filters.minBedrooms };
  if (filters.minBathrooms) query["features.bathrooms"] = { $gte: filters.minBathrooms };
  if (filters.minGarages) query["features.garages"] = { $gte: filters.minGarages };
  if (filters.areaMin != null || filters.areaMax != null) {
    // La superficie que se muestra es la cubierta si hay; si no, la total: el filtro mira la misma.
    const range = {
      ...(filters.areaMin != null ? { $gte: filters.areaMin } : {}),
      ...(filters.areaMax != null ? { $lte: filters.areaMax } : {}),
    };
    query.$or = [{ "features.coveredArea": { ...range, $gt: 0 } }, { "features.coveredArea": { $in: [null, 0] }, "features.totalArea": range }];
  }
  if (filters.city) query["address.city"] = filters.city;
  if (filters.neighborhood) query["address.neighborhood"] = filters.neighborhood;
  if (filters.ambient) query["media.hasAmbientCover"] = true;
  if (filters.videos) query["media.videos.0"] = { $exists: true };
  if (filters.recent) query.publishedAt = { $gte: new Date(Date.now() - RECENT_DAYS * 86_400_000) };
  if (filters.q) query.$text = { $search: filters.q };
  if (filters.beach != null) query["features.beachDistance"] = { $lte: filters.beach };

  // "Libre en mis fechas": sólo alquileres que no estén marcados no disponibles ni tengan un período ocupado que pise el rango.
  // Una venta no se alquila, así que con fechas sólo quedan alquileres.
  if (filters.from && filters.to && filters.operation !== "venta" && checkRange({ from: filters.from, to: filters.to }) === null) {
    if (!filters.operation) query.operation = { $in: [...RENTAL_OPERATIONS] };
    query["availability.state"] = { $ne: "unavailable" };
    query["availability.blocked"] = { $not: { $elemMatch: { from: { $lte: filters.to }, to: { $gte: filters.from } } } };
  }

  return query;
}

export const PROPERTY_CARD_PROJECTION =
  "title slug price operation type address location features.bedrooms features.bathrooms features.totalArea features.coveredArea features.beachDistance availability.state availability.blocked media.images media.hasTour3d media.hasAmbientCover media.ambient.poster.url publishedAt agencyId";
