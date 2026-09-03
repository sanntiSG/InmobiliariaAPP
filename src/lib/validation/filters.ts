import { z } from "zod";
import { OPERATIONS, PROPERTY_TYPES, AMENITIES } from "@/config/filters";

const typeListTransform = (v: string | undefined) =>
  v
    ? v.split(",").filter((t): t is (typeof PROPERTY_TYPES)[number] => (PROPERTY_TYPES as readonly string[]).includes(t))
    : undefined;

const amenityListTransform = (v: string | undefined) =>
  v ? v.split(",").filter((a): a is (typeof AMENITIES)[number] => (AMENITIES as readonly string[]).includes(a)) : undefined;

/** Filtros de búsqueda compartidos entre el mapa y el listado. */
const baseFiltersShape = {
  q: z.string().trim().min(1).max(100).optional(),
  operation: z.enum(OPERATIONS).optional(),
  type: z.string().optional().transform(typeListTransform),
  priceMin: z.coerce.number().nonnegative().optional(),
  priceMax: z.coerce.number().positive().optional(),
  minRooms: z.coerce.number().int().nonnegative().optional(),
  amenities: z.string().optional().transform(amenityListTransform),
  tour3d: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  agencyId: z.string().length(24).optional(),
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
