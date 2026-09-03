export type LngLat = [number, number];
export type BBox = { west: number; south: number; east: number; north: number };

/** Parsea "west,south,east,north" (formato estándar de bbox de mapas). */
export function parseBBox(raw: string | null): BBox | null {
  if (!raw) return null;
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  const [west, south, east, north] = parts;
  if (west >= east || south >= north) return null;
  return { west, south, east, north };
}

/** Construye el filtro geoespacial de Mongo ($geoWithin + $box) a partir de un bbox. */
export function bboxToGeoWithin(bbox: BBox) {
  return {
    $geoWithin: {
      $box: [
        [bbox.west, bbox.south],
        [bbox.east, bbox.north],
      ],
    },
  };
}

/**
 * Offset determinístico (~hasta 150m) para difuminar la ubicación de
 * propiedades con `address.showExact: false`. Determinístico por id para que
 * el mismo pin no "salte" entre requests, pero sin revelar el punto real.
 */
export function fuzzLocation(coords: LngLat, seed: string): LngLat {
  const hash = hashString(seed);
  const angle = (hash % 360) * (Math.PI / 180);
  const distanceMeters = 60 + (hash % 90); // 60–150m
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng = 111_320 * Math.cos((coords[1] * Math.PI) / 180);

  const dLat = (distanceMeters * Math.sin(angle)) / metersPerDegreeLat;
  const dLng = (distanceMeters * Math.cos(angle)) / metersPerDegreeLng;

  return [coords[0] + dLng, coords[1] + dLat];
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Distancia aproximada en metros entre dos puntos (haversine). */
export function distanceMeters(a: LngLat, b: LngLat): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
