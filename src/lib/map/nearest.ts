/**
 * "La zona más cercana donde sí hay propiedades": la propiedad más cercana a un punto que cumpla una consulta y cuántas hay
 * alrededor de ella. Lo usan la geolocalización del mapa (todas las publicadas) y las alternativas cuando los filtros no dan
 * resultados (las que cumplen los mismos filtros). Usa el índice 2dsphere de Property vía `$geoNear`.
 */
import { Property } from "@/lib/db/models/Property";
import { NEARBY_RADIUS_KM } from "@/config/site";

export type NearestMatch = {
  city: string;
  neighborhood?: string;
  lng: number;
  lat: number;
  distanceKm: number;
  /** Cuántas hay alrededor de esa propiedad (dentro del radio de cercanía). */
  count: number;
};

/**
 * `query` es el filtro de Mongo (con `status: "published"`). OJO: `$geoNear` no se puede combinar con `$text`, así que quien llama
 * tiene que sacar el texto de búsqueda antes. `key: "location"` es obligatorio: Property tiene más de un índice 2dsphere (el
 * compuesto {location,status} y uno viejo suelto que Mongoose no borra solo) y sin esto Mongo no sabe cuál usar.
 */
export async function nearestMatch(lng: number, lat: number, query: Record<string, unknown>): Promise<NearestMatch | null> {
  const [nearestDoc] = await Property.aggregate([
    { $geoNear: { near: { type: "Point", coordinates: [lng, lat] }, distanceField: "distanceMeters", spherical: true, query, key: "location" } },
    { $limit: 1 },
    { $project: { "address.city": 1, "address.neighborhood": 1, location: 1, distanceMeters: 1 } },
  ]);
  if (!nearestDoc) return null;

  const [nearLng, nearLat] = nearestDoc.location.coordinates as [number, number];
  // Cuántas hay alrededor de ESA propiedad ("8 propiedades" en vez de mostrar sólo la más cercana).
  const around = await Property.aggregate([
    { $geoNear: { near: { type: "Point", coordinates: [nearLng, nearLat] }, distanceField: "distanceMeters", maxDistance: NEARBY_RADIUS_KM * 1000, spherical: true, query, key: "location" } },
    { $count: "count" },
  ]);

  return {
    city: nearestDoc.address?.city ?? "",
    neighborhood: nearestDoc.address?.neighborhood ?? undefined,
    lng: nearLng,
    lat: nearLat,
    distanceKm: Math.round((nearestDoc.distanceMeters / 1000) * 10) / 10,
    count: around[0]?.count ?? 1,
  };
}
