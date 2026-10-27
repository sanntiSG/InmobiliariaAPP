import { z } from "zod";
import { OPERATIONS, PROPERTY_TYPES, AMENITIES, CURRENCIES } from "@/config/filters";

const typeListTransform = (v: string | undefined) =>
  v
    ? v.split(",").filter((t): t is (typeof PROPERTY_TYPES)[number] => (PROPERTY_TYPES as readonly string[]).includes(t))
    : undefined;

const amenityListTransform = (v: string | undefined) =>
  v ? v.split(",").filter((a): a is (typeof AMENITIES)[number] => (AMENITIES as readonly string[]).includes(a)) : undefined;

/** "true" / "false" de la dirección como booleano (ausente = sin filtrar). */
const triState = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === "true"));

/** Filtros de búsqueda compartidos entre el mapa y el listado. */
const baseFiltersShape = {
  q: z.string().trim().min(1).max(100).optional(),
  operation: z.enum(OPERATIONS).optional(),
  type: z.string().optional().transform(typeListTransform),
  priceMin: z.coerce.number().nonnegative().optional(),
  // `nonnegative` (no `positive`): cualquier valor que arma la interfaz tiene que ser válido acá; un 0 da "sin resultados", no un 400.
  priceMax: z.coerce.number().nonnegative().optional(),
  minRooms: z.coerce.number().int().nonnegative().optional(),
  amenities: z.string().optional().transform(amenityListTransform),
  tour3d: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  agencyId: z.string().length(24).optional(),
  /** Moneda del rango de precio (sin moneda el precio se compara tal cual, como antes). */
  currency: z.enum(CURRENCIES).optional(),
  minBedrooms: z.coerce.number().int().nonnegative().max(50).optional(),
  minBathrooms: z.coerce.number().int().nonnegative().max(50).optional(),
  minGarages: z.coerce.number().int().nonnegative().max(50).optional(),
  areaMin: z.coerce.number().nonnegative().max(1_000_000).optional(),
  areaMax: z.coerce.number().nonnegative().max(1_000_000).optional(),
  /** Ubicación exacta (los valores salen de /api/properties/facets). */
  city: z.string().trim().min(1).max(80).optional(),
  neighborhood: z.string().trim().min(1).max(80).optional(),
  ambient: triState,
  videos: triState,
  recent: triState,
  /** Hasta cuántos metros de la playa. */
  beach: z.coerce.number().int().min(0).max(20_000).optional(),
  /** "Libre en mis fechas": ambos días (`YYYY-MM-DD`) o ninguno; la consulta ignora un rango inválido. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
};

/** Query params aceptados por GET /api/map/properties. */
export const mapFiltersSchema = z.object({
  ...baseFiltersShape,
  bbox: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
    .optional(),
  limit: z.coerce.number().int().positive().max(500).default(300),
});

export const LIST_SORTS = ["recientes", "precio_asc", "precio_desc"] as const;

/** Query params aceptados por GET /api/properties (listado paginado). */
export const listFiltersSchema = z.object({
  ...baseFiltersShape,
  sort: z.enum(LIST_SORTS).default("recientes"),
  page: z.coerce.number().int().positive().max(1000).default(1),
  pageSize: z.coerce.number().int().positive().max(48).default(24),
});

export type MapFiltersInput = z.infer<typeof mapFiltersSchema>;
export type ListFiltersInput = z.infer<typeof listFiltersSchema>;
