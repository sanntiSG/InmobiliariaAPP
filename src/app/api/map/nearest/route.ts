import { NextRequest, NextResponse } from "next/server";
import { softLimitOr429 } from "@/lib/security/rate-limit";
import { z } from "zod";
import { connectDB } from "@/lib/db/connect";
import { Property } from "@/lib/db/models/Property";
import { NEARBY_RADIUS_KM } from "@/config/site";
import { nearestMatch, type NearestMatch } from "@/lib/map/nearest";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  lng: z.coerce.number().gte(-180).lte(180),
  lat: z.coerce.number().gte(-90).lte(90),
});

type NearestResponse = {
  countWithin: number;
  radiusKm: number;
  nearest: NearestMatch | null;
};

/**
 * Para la geolocalización de /mapa: ¿hay propiedades cerca del usuario, y si
 * no, cuál es la zona más cercana donde sí las hay? Se usa el índice
 * 2dsphere de Property (ver models/Property.ts) vía $geoNear.
 */
export async function GET(req: NextRequest) {
  const limited = softLimitOr429(req, "map-nearest", 30, 60);
  if (limited) return limited;

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

  // 2) Nada cerca: la zona más cercana donde sí hay (con el salto ya armado) y cuántas hay alrededor de ella.
  return { countWithin: 0, radiusKm: NEARBY_RADIUS_KM, nearest: await nearestMatch(lng, lat, { status: "published" }) };
}
