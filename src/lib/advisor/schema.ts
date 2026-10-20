/** Validación de lo que llega al servidor desde el cliente (todo es no confiable). */
import { z } from "zod";
import { AMENITIES, OPERATIONS, PROPERTY_TYPES } from "@/config/filters";
import { AGENCY_INTENTS, COMMON_INTENTS, EXPLORER_INTENTS } from "./types";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const ALL_INTENTS = [...AGENCY_INTENTS, ...EXPLORER_INTENTS, ...COMMON_INTENTS] as const;

const money = z.object({
  amount: z.number().positive().max(1_000_000_000),
  currency: z.enum(["USD", "ARS"]).nullable(),
});

export const slotsSchema = z.object({
  period: z.enum(["today", "yesterday", "week", "prev_week", "month", "prev_month"]).optional(),
  metric: z.enum(["views", "inquiries", "saves", "likes", "shares", "tour", "dwell", "interest", "conversion"]).optional(),
  direction: z.enum(["worst", "best"]).optional(),
  zones: z.array(z.string().trim().min(1).max(60)).max(3).optional(),
  types: z.array(z.enum(PROPERTY_TYPES)).max(4).optional(),
  operation: z.enum(OPERATIONS).optional(),
  propertyIds: z.array(objectId).max(20).optional(),
  percent: z.number().min(-90).max(200).optional(),
  priceMax: money.optional(),
  priceMin: money.optional(),
  rooms: z.number().int().min(0).max(20).optional(),
  bedrooms: z.number().int().min(0).max(20).optional(),
  amenities: z.array(z.enum(AMENITIES)).max(8).optional(),
  count: z.number().int().min(1).max(10).optional(),
  withTour: z.boolean().optional(),
  field: z.enum(["price", "photos", "description", "videos", "tour360"]).optional(),
  text: z.string().max(120).optional(),
});

export const contextSchema = z.object({
  turn: z.number().int().min(0).max(1000),
  lastIntent: z.enum(ALL_INTENTS).optional(),
  lastSlots: slotsSchema.optional(),
  resultIds: z.array(objectId).max(20).optional(),
  focusPropertyId: objectId.optional(),
});

export const inputSchema = z.union([
  z.object({ text: z.string().trim().min(1).max(300) }),
  z.object({ query: z.object({ intent: z.enum(ALL_INTENTS), slots: slotsSchema.optional() }) }),
]);

export const askBodySchema = z.object({
  mode: z.enum(["agency", "explorer"]),
  /** Sólo el admin lo usa para elegir una inmobiliaria; para el resto se ignora. */
  agencyId: objectId.optional(),
  input: inputSchema,
  context: contextSchema.optional(),
  /** Prueba del estudio del admin: usa el borrador de la configuración (sólo admin). */
  preview: z.boolean().optional(),
});

export const briefingBodySchema = z.object({
  mode: z.enum(["agency", "explorer"]),
  agencyId: objectId.optional(),
  /** Propiedad que la persona está mirando (ficha). */
  focusPropertyId: objectId.optional(),
  preview: z.boolean().optional(),
});
