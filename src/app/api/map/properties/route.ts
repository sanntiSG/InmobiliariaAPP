import { NextRequest, NextResponse } from "next/server";
import { softLimitOr429 } from "@/lib/security/rate-limit";
import type { z } from "zod";
import { connectDB } from "@/lib/db/connect";
import { Property } from "@/lib/db/models/Property";
import { mapFiltersSchema } from "@/lib/validation/filters";
import { parseBBox, bboxToGeoWithin } from "@/lib/map/geo";
import { buildPropertyQuery, PROPERTY_CARD_PROJECTION } from "@/lib/db/property-query";
import { toPropertyCardData } from "@/lib/db/property-card-mapper";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = softLimitOr429(req, "map-properties", 240, 60);
  if (limited) return limited;

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
    // Sin `features: []` a propósito: si el cliente viera un FeatureCollection
    // vacío no podría distinguir "no hay propiedades acá" de "la DB está
    // caída", y mostraba el mismo estado vacío para ambos casos.
    return NextResponse.json({ error: "No se pudo conectar a la base de datos. Ver SETUP.md." }, { status: 503 });
  }
}

async function getProperties(filters: z.infer<typeof mapFiltersSchema>) {
  await connectDB();

  const query = buildPropertyQuery(filters);
  const bbox = parseBBox(filters.bbox ?? null);
  if (bbox) query.location = bboxToGeoWithin(bbox);

  const docs = await Property.find(query)
    .select(PROPERTY_CARD_PROJECTION)
    .populate({ path: "agencyId", select: "name slug logo" })
    .limit(filters.limit)
    .lean();

  const now = Date.now();
  const features = docs.map((doc) => {
    const properties = toPropertyCardData(doc, now);
    return {
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [properties.lng, properties.lat] },
      properties,
    };
  });

  return NextResponse.json(
    { type: "FeatureCollection", features },
    // SIN caché compartido (CDN): la respuesta depende de los parámetros de la dirección (filtros, zona, página) y el caché de Netlify
    // ignora lo que va después del "?": servía el resultado de una consulta a otra (por ejemplo, el de "ventas" a "alquiler temporal") y
    // el listado y el mapa mostraban propiedades que no correspondían. El navegador igual no guarda nada y revalida siempre.
    { headers: { "Cache-Control": "no-store" } }
  );
}
