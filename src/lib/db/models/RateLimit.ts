import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";

/**
 * Contador de ventana fija para rate limiting (ver `lib/security/rate-limit.ts`).
 * Una fila por (clave, ventana); el índice TTL la borra sola, así que la
 * colección nunca crece. Funciona en serverless: el estado vive en Mongo, no
 * en la memoria de una instancia.
 */
const rateLimitSchema = new Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});

rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RateLimitDoc = InferSchemaType<typeof rateLimitSchema>;

export const RateLimit: Model<RateLimitDoc> =
  models.RateLimit ?? model<RateLimitDoc>("RateLimit", rateLimitSchema);
