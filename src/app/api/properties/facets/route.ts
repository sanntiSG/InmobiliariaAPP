import { NextRequest, NextResponse } from "next/server";
import { getFacets } from "@/lib/filters/facets";
import { softLimitOr429 } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Opciones reales para los filtros (ciudades y barrios con cantidades, comodidades y rangos de precio por moneda). Datos
 * públicos y agregados: sólo cuentan propiedades publicadas. `?agencyId=` limita a una inmobiliaria.
 */
export async function GET(req: NextRequest) {
  const limited = softLimitOr429(req, "properties-facets", 60, 60);
  if (limited) return limited;
  const agencyId = req.nextUrl.searchParams.get("agencyId");
  try {
    return NextResponse.json(await getFacets(agencyId && /^[a-f0-9]{24}$/i.test(agencyId) ? agencyId : null), {
      // Sin caché compartido: depende de `?agencyId=` y el caché de Netlify ignora los parámetros (ver las otras dos rutas). El servidor ya
      // guarda el cálculo 5 minutos en su memoria (`getFacets`).
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("GET /api/properties/facets failed:", (err as Error)?.message);
    return NextResponse.json({ error: "No se pudieron cargar las opciones." }, { status: 503 });
  }
}
