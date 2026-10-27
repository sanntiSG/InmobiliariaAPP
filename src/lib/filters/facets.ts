/**
 * Lo que hay publicado, para armar los filtros con opciones reales: ciudades y barrios con cuántas propiedades tiene cada uno,
 * cuántas tienen cada comodidad y entre qué precios se mueve cada moneda. Se calcula con una sola consulta sobre las propiedades
 * publicadas (opcionalmente de una sola inmobiliaria) y se guarda 5 minutos: la hoja de filtros lo pide recién al abrirse.
 */
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { Property } from "@/lib/db/models/Property";
import { memo } from "@/lib/intelligence/cache";

export type Facets = {
  total: number;
  cities: { value: string; count: number }[];
  neighborhoods: { value: string; city: string; count: number }[];
  /** Cuántas propiedades tienen cada comodidad (sólo las que alguna tiene). */
  amenities: Record<string, number>;
  /** Precio mínimo y máximo por moneda y operación. */
  prices: { currency: string; operation: string; min: number; max: number; count: number }[];
  /** La superficie más grande publicada, en m². */
  maxArea: number;
  /** Cuántas propiedades informan la distancia a la playa (si no hay ninguna, el filtro no se ofrece). */
  beachCount: number;
};

const TTL_MS = 5 * 60_000;
const MAX_CITIES = 60;
const MAX_NEIGHBORHOODS = 250;

export function getFacets(agencyId?: string | null): Promise<Facets> {
  const scope = agencyId && Types.ObjectId.isValid(agencyId) ? agencyId : null;
  return memo(`facets:${scope ?? "all"}`, TTL_MS, async () => {
    await connectDB();
    const match: Record<string, unknown> = { status: "published" };
    if (scope) match.agencyId = new Types.ObjectId(scope);

    const [out] = await Property.aggregate<{
      total: { n: number }[];
      cities: { _id: string; n: number }[];
      hoods: { _id: { city: string; hood: string }; n: number }[];
      amenities: { _id: string; n: number }[];
      prices: { _id: { currency: string; operation: string }; min: number; max: number; n: number }[];
      area: { max: number }[];
      beach: { n: number }[];
    }>([
      { $match: match },
      {
        $facet: {
          total: [{ $count: "n" }],
          cities: [{ $match: { "address.city": { $nin: [null, ""] } } }, { $group: { _id: "$address.city", n: { $sum: 1 } } }, { $sort: { n: -1, _id: 1 } }, { $limit: MAX_CITIES }],
          hoods: [
            { $match: { "address.neighborhood": { $nin: [null, ""] }, "address.city": { $nin: [null, ""] } } },
            { $group: { _id: { city: "$address.city", hood: "$address.neighborhood" }, n: { $sum: 1 } } },
            { $sort: { n: -1, "_id.hood": 1 } },
            { $limit: MAX_NEIGHBORHOODS },
          ],
          amenities: [{ $unwind: "$amenities" }, { $group: { _id: "$amenities", n: { $sum: 1 } } }],
          // En un alquiler temporal el rango es el del equivalente por noche (lo que compara el filtro), no el monto de cada período.
          prices: [
            {
              $group: {
                _id: { currency: "$price.currency", operation: "$operation" },
                min: { $min: { $cond: [{ $eq: ["$operation", "alquiler_temporal"] }, { $ifNull: ["$price.perNight", "$price.amount"] }, "$price.amount"] } },
                max: { $max: { $cond: [{ $eq: ["$operation", "alquiler_temporal"] }, { $ifNull: ["$price.perNight", "$price.amount"] }, "$price.amount"] } },
                n: { $sum: 1 },
              },
            },
          ],
          beach: [{ $match: { "features.beachDistance": { $ne: null } } }, { $count: "n" }],
          area: [{ $group: { _id: null, max: { $max: { $cond: [{ $gt: ["$features.coveredArea", 0] }, "$features.coveredArea", { $ifNull: ["$features.totalArea", 0] }] } } } }],
        },
      },
    ]);

    return {
      total: out?.total[0]?.n ?? 0,
      cities: (out?.cities ?? []).map((c) => ({ value: c._id, count: c.n })),
      neighborhoods: (out?.hoods ?? []).map((h) => ({ value: h._id.hood, city: h._id.city, count: h.n })),
      amenities: Object.fromEntries((out?.amenities ?? []).map((a) => [a._id, a.n])),
      prices: (out?.prices ?? []).filter((p) => p._id.currency && p._id.operation).map((p) => ({ currency: p._id.currency, operation: p._id.operation, min: p.min, max: p.max, count: p.n })),
      maxArea: Math.ceil(out?.area[0]?.max ?? 0),
      beachCount: out?.beach[0]?.n ?? 0,
    };
  });
}
