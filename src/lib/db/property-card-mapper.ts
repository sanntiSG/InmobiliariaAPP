import { fuzzLocation } from "@/lib/map/geo";
import { effectivePeriod, isRentalOperation } from "@/config/pricing";
import { rentalStatus, todayAr } from "@/lib/availability";
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
    | { bedrooms?: number | null; bathrooms?: number | null; totalArea?: number | null; coveredArea?: number | null; beachDistance?: number | null }
    | null;
  availability?: { state?: string | null; blocked?: { from: string; to: string }[] | null } | null;
  media?: {
    images?: { url: string; order?: number | null }[];
    hasTour3d?: boolean | null;
    hasAmbientCover?: boolean | null;
    ambient?: { poster?: { url?: string | null } | null } | null;
  } | null;
  publishedAt?: Date | string | null;
  agencyId?: unknown;
};

/** Mapea un doc lean de Property al shape liviano que consumen el mapa y el listado. */
export function toPropertyCardData(doc: LeanPropertyDoc, now: number = Date.now()): PropertyCardData {
  const [lng, lat] = doc.location.coordinates as [number, number];
  const [safeLng, safeLat] =
    doc.address?.showExact === false ? fuzzLocation([lng, lat], String(doc._id)) : [lng, lat];

  const agency = doc.agencyId as unknown as { name?: string; slug?: string; logo?: string | null } | null;

  const coverImage = doc.media?.images?.length
    ? [...doc.media.images].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0]
    : undefined;
  // Con portada viva la tarjeta muestra su póster (el estado inicial como imagen común): el reproductor sólo vive en la ficha.
  const ambientPoster = doc.media?.hasAmbientCover ? doc.media.ambient?.poster?.url || undefined : undefined;

  return {
    id: String(doc._id),
    slug: doc.slug,
    title: doc.title,
    price: doc.price!.amount,
    currency: doc.price!.currency!,
    // El período que corresponde a la operación (un alquiler viejo guardado como "total" se muestra "/mes").
    period: effectivePeriod(doc.operation, doc.price!.period),
    operation: doc.operation,
    type: doc.type,
    neighborhood: doc.address?.neighborhood ?? undefined,
    city: doc.address?.city ?? "",
    image: ambientPoster ?? coverImage?.url ?? null,
    ambient: !!ambientPoster,
    bedrooms: doc.features?.bedrooms ?? undefined,
    bathrooms: doc.features?.bathrooms ?? undefined,
    area: doc.features?.totalArea ?? doc.features?.coveredArea ?? undefined,
    tour3d: !!doc.media?.hasTour3d,
    rental: isRentalOperation(doc.operation)
      ? rentalStatus({ state: doc.availability?.state === "unavailable" ? "unavailable" : "available", blocked: (doc.availability?.blocked ?? []).map((b) => ({ from: b.from, to: b.to })) }, todayAr(new Date(now)))
      : null,
    beachDistance: doc.features?.beachDistance ?? undefined,
    isNew: doc.publishedAt ? now - new Date(doc.publishedAt).getTime() < NEW_WINDOW_DAYS * 86_400_000 : false,
    agencyName: agency?.name,
    agencySlug: agency?.slug,
    agencyLogo: agency?.logo ?? undefined,
    lng: safeLng,
    lat: safeLat,
  };
}
