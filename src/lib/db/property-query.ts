import { Types } from "mongoose";

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
  if (filters.q) query.$text = { $search: filters.q };

  return query;
}

export const PROPERTY_CARD_PROJECTION =
  "title slug price operation type address location features.bedrooms features.bathrooms features.totalArea features.coveredArea media.images media.hasTour3d publishedAt agencyId";
