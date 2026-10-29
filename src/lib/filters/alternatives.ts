/**
 * La respuesta de `GET /api/properties/alternatives` (resultados vacíos): dónde sí hay propiedades con estos filtros y qué filtro
 * conviene quitar. Sólo tipos: la usan la ruta y la pantalla sin que la pantalla importe código del servidor.
 */
import type { NearestMatch } from "@/lib/map/nearest";

export type AlternativesResponse = {
  /** Cuántas propiedades cumplen los filtros en TODA la plataforma (no sólo en la zona que se está mirando). */
  total: number;
  /** La zona más cercana al centro del mapa donde sí hay propiedades con estos filtros (no se ofrece si hay texto de búsqueda). */
  nearest: NearestMatch | null;
  /** Qué filtro conviene quitar: cuántas habría sin él (sólo los que dejan alguna), de mayor a menor. */
  relax: { chipId: string; label: string; count: number }[];
};
