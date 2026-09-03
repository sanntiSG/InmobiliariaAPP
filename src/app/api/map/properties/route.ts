import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { Property } from "@/lib/db/models/Property";
import { mapFiltersSchema } from "@/lib/validation/filters";
import { parseBBox, bboxToGeoWithin, fuzzLocation } from "@/lib/map/geo";
import type { PropertyCardData } from "@/components/property/types";

export const dynamic = "force-dynamic";

const NEW_WINDOW_DAYS = 14;

export async function GET(req: NextRequest) {
  const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = mapFiltersSchema.safeParse(searchParams);

  if (!parsed.success) {
    return NextResponse.json({ error: "Parámetros inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  const filters = parsed.data;

  try {
    return await getProperties(filters);
  } catch (err) {
    console.error("GET /api/map/properties failed:", err);
    return NextResponse.json(
      { error: "No se pudo conectar a la base de datos. Ver SETUP.md.", type: "FeatureCollection", features: [] },
      { status: 503 }
    );
  }
}

async function getProperties(filters: z.infer<typeof mapFiltersSchema>) {
  await connectDB();

  const query: Record<string, unknown> = { status: "published" };

  const bbox = parseBBox(filters.bbox ?? null);
  if (bbox) query.location = bboxToGeoWithin(bbox);

  if (filters.operation) query.operation = filters.operation;
  if (filters.type && filters.type.length > 0) query.type = { $in: filters.type };
  if (filters.amenities && filters.amenities.length > 0) query.amenities = { $all: filters.amenities };
  if (filters.tour3d) query["media.tour3d.enabled"] = true;
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

  const docs = await Property.find(query)
    .select(
      "title slug price operation type address location features.bedrooms features.bathrooms features.totalArea features.coveredArea media.images media.tour3d publishedAt agencyId"
    )
    .populate({ path: "agencyId", select: "name" })
    .limit(filters.limit)
    .lean();

  const now = Date.now();
  const features = docs.map((doc) => {
    const [lng, lat] = doc.location.coordinates as [number, number];
    const [safeLng, safeLat] = doc.address?.showExact === false ? fuzzLocation([lng, lat], String(doc._id)) : [lng, lat];

    const agency = doc.agencyId as unknown as { name?: string } | null;

    const properties: PropertyCardData = {
      id: String(doc._id),
      slug: doc.slug,
      title: doc.title,
      price: doc.price!.amount,
      currency: doc.price!.currency!,
      period: doc.price!.period as "total" | "mensual",
      operation: doc.operation,
      type: doc.type,
      neighborhood: doc.address?.neighborhood ?? undefined,
      city: doc.address?.city ?? "",
      image: doc.media?.images?.[0]?.url ?? null,
      bedrooms: doc.features?.bedrooms ?? undefined,
      bathrooms: doc.features?.bathrooms ?? undefined,
      area: doc.features?.totalArea ?? doc.features?.coveredArea ?? undefined,
      tour3d: !!doc.media?.tour3d?.enabled,
      isNew: doc.publishedAt ? now - new Date(doc.publishedAt).getTime() < NEW_WINDOW_DAYS * 86_400_000 : false,
      agencyName: agency?.name,
      lng: safeLng,
      lat: safeLat,
    };

    return {
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [safeLng, safeLat] },
      properties,
    };
  });

  return NextResponse.json(
    { type: "FeatureCollection", features },
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } }
  );
}
