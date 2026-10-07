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
    // El navegador siempre revalida: antes (max-age=30 + stale-while-revalidate=60) una propiedad recién
    // publicada tardaba hasta ~90 s en aparecer. Sólo un CDN, si lo hay, amortigua unos segundos.
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=10, stale-while-revalidate=20" } }
  );
}
