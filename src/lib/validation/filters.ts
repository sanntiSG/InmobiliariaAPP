import { z } from "zod";
import { OPERATIONS, PROPERTY_TYPES, AMENITIES } from "@/config/filters";

/** Query params aceptados por GET /api/map/properties. Todo opcional. */
export const mapFiltersSchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  bbox: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
    .optional(),
  operation: z.enum(OPERATIONS).optional(),
  type: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").filter((t): t is (typeof PROPERTY_TYPES)[number] => (PROPERTY_TYPES as readonly string[]).includes(t)) : undefined)),
  priceMin: z.coerce.number().nonnegative().optional(),
  priceMax: z.coerce.number().positive().optional(),
  minRooms: z.coerce.number().int().nonnegative().optional(),
  amenities: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").filter((a): a is (typeof AMENITIES)[number] => (AMENITIES as readonly string[]).includes(a)) : undefined)),
  tour3d: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  agencyId: z.string().length(24).optional(),
  limit: z.coerce.number().int().positive().max(500).default(300),
});

export type MapFiltersInput = z.infer<typeof mapFiltersSchema>;
