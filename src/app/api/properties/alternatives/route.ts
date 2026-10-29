import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/connect";
import { Property } from "@/lib/db/models/Property";
import { buildPropertyQuery } from "@/lib/db/property-query";
import { filtersToSearchParams, parseFilters, type PropertyFiltersState } from "@/lib/filters/state";
import { relaxCandidates } from "@/lib/filters/relax";
import { nearestMatch } from "@/lib/map/nearest";
import type { AlternativesResponse } from "@/lib/filters/alternatives";
import { listFiltersSchema } from "@/lib/validation/filters";
import { softLimitOr429 } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/** Cuánto puede tardar cada conteo: una sugerencia que demora no sirve, y la base no se carga por esto. */
const COUNT_MS = 1500;
const MAX_SUGGESTIONS = 3;

const geoSchema = z.object({ lng: z.coerce.number().gte(-180).lte(180), lat: z.coerce.number().gte(-90).lte(90) });


/** El filtro de Mongo de un estado de filtros: pasa por la misma validación que el listado y el mapa, así no hay un camino aparte. */
function queryOf(state: PropertyFiltersState): Record<string, unknown> | null {
  const parsed = listFiltersSchema.safeParse(Object.fromEntries(filtersToSearchParams(state).entries()));
  return parsed.success ? buildPropertyQuery(parsed.data) : null;
}

/**
 * Para los resultados vacíos: en vez de "0 propiedades", dónde sí hay con estos filtros y qué filtro conviene quitar. Recibe los
 * mismos parámetros que el listado y, opcionalmente, el centro del mapa (`lng`, `lat`). Sólo cuenta propiedades publicadas.
 */
export async function GET(req: NextRequest) {
  const limited = softLimitOr429(req, "alternatives", 30, 60);
  if (limited) return limited;

  const params = req.nextUrl.searchParams;
  const state = parseFilters(params);
  const base = queryOf(state);
  if (!base) return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  // Sin las dos coordenadas no hay "zona más cercana" (ojo: `coerce` convertiría un valor ausente en 0 y buscaría en 0,0).
  const rawLng = params.get("lng");
  const rawLat = params.get("lat");
  const geo = rawLng && rawLat ? geoSchema.safeParse({ lng: rawLng, lat: rawLat }) : null;

  try {
    await connectDB();
    // `$geoNear` no admite `$text`, y buscar "la zona más cercana" ignorando el texto sería engañoso ("hay 41 cerca" sin decir que no
    // coinciden con lo escrito): con texto de búsqueda no se ofrece zona; la sugerencia es quitar el texto (ver `relax`).
    const nearQuery = state.q ? null : base;
    const suggestions = relaxCandidates(state).map((c) => ({ ...c, query: queryOf(parseFilters(new URLSearchParams(c.params))) }));

    const [total, counts, nearest] = await Promise.all([
      Property.countDocuments(base).maxTimeMS(COUNT_MS).catch(() => 0),
      Promise.all(suggestions.map((s) => (s.query ? Property.countDocuments(s.query).maxTimeMS(COUNT_MS).catch(() => 0) : Promise.resolve(0)))),
      geo?.success && nearQuery ? nearestMatch(geo.data.lng, geo.data.lat, nearQuery).catch(() => null) : Promise.resolve(null),
    ]);

    const relax = suggestions
      .map((s, i) => ({ chipId: s.chipId, label: s.label, count: counts[i] ?? 0 }))
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_SUGGESTIONS);

    const body: AlternativesResponse = { total, nearest, relax };
    return NextResponse.json(body, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (err) {
    console.error("GET /api/properties/alternatives failed:", err);
    return NextResponse.json({ error: "No se pudieron buscar alternativas." }, { status: 503 });
  }
}
