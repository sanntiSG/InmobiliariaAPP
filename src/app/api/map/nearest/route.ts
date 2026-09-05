import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/connect";
import { Property } from "@/lib/db/models/Property";
import { NEARBY_RADIUS_KM } from "@/config/site";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  lng: z.coerce.number().gte(-180).lte(180),
  lat: z.coerce.number().gte(-90).lte(90),
});

type NearestResponse = {
  countWithin: number;
  radiusKm: number;
  nearest: {
    city: string;
    neighborhood?: string;
    lng: number;
    lat: number;
    distanceKm: number;
    count: number;
  } | null;
};

/**
 * Para la geolocalización de /mapa: ¿hay propiedades cerca del usuario, y si
 * no, cuál es la zona más cercana donde sí las hay? Se usa el índice
 * 2dsphere de Property (ver models/Property.ts) vía $geoNear.
 */
export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: "Parámetros inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const body = await getNearest(parsed.data.lng, parsed.data.lat);
    return NextResponse.json(body);
  } catch (err) {
    console.error("GET /api/map/nearest failed:", err);
    return NextResponse.json({ error: "No se pudo conectar a la base de datos." }, { status: 503 });
  }
}

async function getNearest(lng: number, lat: number): Promise<NearestResponse> {
  await connectDB();
  const radiusMeters = NEARBY_RADIUS_KM * 1000;

  // 1) ¿Cuántas hay dentro del radio del usuario? Si hay al menos una, no
  // hace falta ofrecer ninguna zona alternativa.
  const withinCount = await Property.aggregate([
    {
      $geoNear: {
        near: { type: "Point", coordinates: [lng, lat] },
        distanceField: "distanceMeters",
        maxDistance: radiusMeters,
        spherical: true,
        query: { status: "published" },
        // Obligatorio: Property tiene más de un índice 2dsphere (el
        // compuesto {location,status} y uno viejo suelto que Mongoose no
        // borra solo al cambiar la definición) — sin esto, $geoNear tira
        // "unsure which index to use".
        key: "location",
      },
    },
    { $count: "count" },
  ]);
  const countWithin = withinCount[0]?.count ?? 0;

  if (countWithin > 0) {
    return { countWithin, radiusKm: NEARBY_RADIUS_KM, nearest: null };
  }

  // 2) Nada cerca: la propiedad más cercana sin límite de distancia, para
  // poder ofrecer "ver <ciudad>" con el salto ya armado.
  const [nearestDoc] = await Property.aggregate([
    {
      $geoNear: {
        near: { type: "Point", coordinates: [lng, lat] },
        distanceField: "distanceMeters",
        spherical: true,
        query: { status: "published" },
        key: "location",
      },
    },
    { $limit: 1 },
    { $project: { "address.city": 1, "address.neighborhood": 1, location: 1, distanceMeters: 1 } },
  ]);

  if (!nearestDoc) {
    return { countWithin: 0, radiusKm: NEARBY_RADIUS_KM, nearest: null };
  }

  const [nearLng, nearLat] = nearestDoc.location.coordinates as [number, number];

  // 3) Cuántas hay alrededor de ESA propiedad (para "8 propiedades" en vez
  // de solo mostrar la más cercana sola).
  const aroundCount = await Property.aggregate([
    {
      $geoNear: {
        near: { type: "Point", coordinates: [nearLng, nearLat] },
        distanceField: "distanceMeters",
        maxDistance: radiusMeters,
        spherical: true,
        query: { status: "published" },
        key: "location",
      },
    },
    { $count: "count" },
  ]);

  return {
    countWithin: 0,
    radiusKm: NEARBY_RADIUS_KM,
    nearest: {
      city: nearestDoc.address?.city ?? "",
      neighborhood: nearestDoc.address?.neighborhood ?? undefined,
      lng: nearLng,
      lat: nearLat,
      distanceKm: Math.round((nearestDoc.distanceMeters / 1000) * 10) / 10,
      count: aroundCount[0]?.count ?? 1,
    },
  };
}
