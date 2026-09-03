import { fuzzLocation } from "@/lib/map/geo";
import type { PropertyCardData } from "@/components/property/types";

const NEW_WINDOW_DAYS = 14;

/** Shape mínima de un doc `.lean()` de Property necesaria para mapear a PropertyCardData. */
export type LeanPropertyDoc = {
  _id: unknown;
  slug: string;
  title: string;
  price?: { amount: number; currency?: string; period?: string } | null;
  operation: string;
  type: string;
  address?: { neighborhood?: string | null; city?: string | null; showExact?: boolean | null } | null;
  location: { coordinates: number[] };
  features?:
    | { bedrooms?: number | null; bathrooms?: number | null; totalArea?: number | null; coveredArea?: number | null }
    | null;
  media?: { images?: { url: string }[]; tour3d?: { enabled?: boolean } | null } | null;
  publishedAt?: Date | string | null;
  agencyId?: unknown;
};

/** Mapea un doc lean de Property al shape liviano que consumen el mapa y el listado. */
export function toPropertyCardData(doc: LeanPropertyDoc, now: number = Date.now()): PropertyCardData {
  const [lng, lat] = doc.location.coordinates as [number, number];
  const [safeLng, safeLat] =
    doc.address?.showExact === false ? fuzzLocation([lng, lat], String(doc._id)) : [lng, lat];

  const agency = doc.agencyId as unknown as { name?: string } | null;

  return {
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
}
