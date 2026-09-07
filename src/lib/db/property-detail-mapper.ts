import { fuzzLocation } from "@/lib/map/geo";
import type { PropertyDetail } from "@/components/property/types";

/** Mapea el doc completo `.lean()` de Property (con agencyId populado) a PropertyDetail. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toPropertyDetail(doc: any): PropertyDetail {
  const [lng, lat] = doc.location.coordinates as [number, number];
  const [safeLng, safeLat] =
    doc.address?.showExact === false ? fuzzLocation([lng, lat], String(doc._id)) : [lng, lat];

  const agency = doc.agencyId;

  return {
    id: String(doc._id),
    slug: doc.slug,
    title: doc.title,
    description: doc.description ?? "",
    operation: doc.operation,
    type: doc.type,
    status: doc.status,

    price: {
      amount: doc.price.amount,
      currency: doc.price.currency,
      expenses: doc.price.expenses ?? 0,
      period: doc.price.period,
    },

    address: {
      street: doc.address?.street,
      number: doc.address?.number,
      neighborhood: doc.address?.neighborhood,
      city: doc.address?.city ?? "",
      province: doc.address?.province,
      country: doc.address?.country ?? "Argentina",
      showExact: doc.address?.showExact !== false,
    },
    lng: safeLng,
    lat: safeLat,

    features: {
      rooms: doc.features?.rooms,
      bedrooms: doc.features?.bedrooms,
      bathrooms: doc.features?.bathrooms,
      garages: doc.features?.garages,
      coveredArea: doc.features?.coveredArea,
      totalArea: doc.features?.totalArea,
      age: doc.features?.age,
      floor: doc.features?.floor,
      orientation: doc.features?.orientation,
    },
    amenities: doc.amenities ?? [],

    images: (doc.media?.images ?? [])
      .slice()
      .sort((a: { order?: number }, b: { order?: number }) => (a.order ?? 0) - (b.order ?? 0))
      .map((img: { url: string; alt?: string }) => ({ url: img.url, alt: img.alt || doc.title })),
    videos: (doc.media?.videos ?? []).map((v: { url: string; thumbnail?: string }) => ({
      url: v.url,
      thumbnail: v.thumbnail,
    })),
    tours: (doc.media?.tours ?? []).map((t: { label?: string; photo360Url: string }) => ({
      label: t.label,
      photo360Url: t.photo360Url,
    })),

    stats: {
      views: doc.stats?.views ?? 0,
      likes: doc.stats?.likes ?? 0,
      saves: doc.stats?.saves ?? 0,
      comments: doc.stats?.comments ?? 0,
      ratingAvg: doc.stats?.ratingAvg ?? 0,
      ratingCount: doc.stats?.ratingCount ?? 0,
    },

    agency: agency
      ? {
          id: String(agency._id),
          slug: agency.slug,
          name: agency.name,
          whatsapp: agency.contact?.whatsapp,
          phone: agency.contact?.phone,
          email: agency.contact?.email,
        }
      : null,

    publishedAt: doc.publishedAt ? new Date(doc.publishedAt).toISOString() : null,
  };
}
