import { Types } from "mongoose";
import { RECENT_DAYS } from "@/lib/filters/state";

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
};

/** Filtro Mongo compartido entre /api/map/properties y /api/properties. */
export function buildPropertyQuery(filters: BaseFilters): Record<string, unknown> {
  const query: Record<string, unknown> = { status: "published" };

  if (filters.operation) query.operation = filters.operation;
  if (filters.type && filters.type.length > 0) query.type = { $in: filters.type };
  if (filters.amenities && filters.amenities.length > 0) query.amenities = { $all: filters.amenities };
  if (filters.tour3d) query["media.hasTour3d"] = true;
  if (filters.minRooms) query["features.rooms"] = { $gte: filters.minRooms };
  if (filters.priceMin != null || filters.priceMax != null) {
    query["price.amount"] = {
      ...(filters.priceMin != null ? { $gte: filters.priceMin } : {}),
      ...(filters.priceMax != null ? { $lte: filters.priceMax } : {}),
    };
  }
  if (filters.agencyId && Types.ObjectId.isValid(filters.agencyId)) {
    query.agencyId = new Types.ObjectId(filters.agencyId);
  }
  // La moneda sólo acota junto con un rango de precio. Sola no es un filtro que la persona pueda ver ni quitar, y antes dejaba
  // en cero, por ejemplo, los alquileres en pesos cuando quedaba elegida "Dólares" sin precio.
  if (filters.currency && (filters.priceMin != null || filters.priceMax != null)) query["price.currency"] = filters.currency;
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

  return query;
}

export const PROPERTY_CARD_PROJECTION =
  "title slug price operation type address location features.bedrooms features.bathrooms features.totalArea features.coveredArea media.images media.hasTour3d media.hasAmbientCover media.ambient.poster.url publishedAt agencyId";
