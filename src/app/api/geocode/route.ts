import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy a Nominatim (OpenStreetMap) — gratis, sin API key, sin límite de
 * tokens. Se proxea desde el server (no se llama directo desde el browser)
 * porque la política de uso de Nominatim exige un User-Agent identificable,
 * que fetch() del navegador no puede setear.
 * https://operations.osmfoundation.org/policies/nominatim/
 */

type NominatimResult = {
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
};

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 3) {
    return NextResponse.json({ results: [] });
  }

  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    addressdetails: "1",
    limit: "6",
    countrycodes: "ar",
  });

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        // Requerido por la política de uso de Nominatim.
        "User-Agent": "Umbral/1.0 (plataforma inmobiliaria; contacto vía la app)",
        "Accept-Language": "es",
      },
      // Cachea resultados idénticos un rato — direcciones no cambian tan seguido.
      next: { revalidate: 3600 },
    });

    if (!res.ok) throw new Error(`Nominatim respondió ${res.status}`);
    const data = (await res.json()) as NominatimResult[];

    const results = data.map((r) => ({
      label: r.display_name,
      lat: Number(r.lat),
      lng: Number(r.lon),
      city: r.address?.city ?? r.address?.town ?? r.address?.village ?? r.address?.county,
      province: r.address?.state,
      neighborhood: r.address?.suburb ?? r.address?.neighbourhood,
    }));

    return NextResponse.json({ results });
  } catch (err) {
    console.error("GET /api/geocode failed:", err);
    return NextResponse.json({ results: [], error: "No se pudo buscar la dirección." }, { status: 503 });
  }
}
