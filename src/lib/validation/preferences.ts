import { z } from "zod";
import { OPERATIONS, PROPERTY_TYPES } from "@/config/filters";

export const preferencesSchema = z.object({
  operations: z.array(z.enum(OPERATIONS)).default([]),
  propertyTypes: z.array(z.enum(PROPERTY_TYPES)).default([]),
  locations: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  priceMin: z.number().nonnegative().optional(),
  priceMax: z.number().positive().optional(),
  minRooms: z.number().int().nonnegative().optional(),
});

export type PreferencesInput = z.infer<typeof preferencesSchema>;
