import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";

export const INTERACTION_TYPES = [
  "view",
  "like",
  "unlike",
  "save",
  "unsave",
  "comment",
  "rate",
  "share",
  "contact",
  "tour_open",
] as const;

/**
 * Log append-only de eventos de usuario. Es la fuente de verdad única tanto
 * para las estadísticas del dashboard de cada inmobiliaria (crecimiento %,
 * likes nuevos, etc. calculado por agregación, sin IA) como para el
 * recomendador por lógica tradicional (ubicaciones vistas, rango de precio
 * recurrente, tipos de propiedad con más interacción).
 */
const interactionSchema = new Schema(
  {
    type: { type: String, enum: INTERACTION_TYPES, required: true, index: true },

    /** Null si el visitante no inició sesión (modo "solo explorar"). */
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    /** Identificador anónimo (cookie) para poder medir sin cuenta. */
    anonId: { type: String, default: null },

    propertyId: { type: Schema.Types.ObjectId, ref: "Property", required: true, index: true },
    agencyId: { type: Schema.Types.ObjectId, ref: "Agency", required: true, index: true },

    /** Metadata liviana propia de cada tipo de evento (rating value, etc). */
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

interactionSchema.index({ propertyId: 1, type: 1, createdAt: -1 });
interactionSchema.index({ agencyId: 1, createdAt: -1 });
interactionSchema.index({ userId: 1, createdAt: -1 });

export type InteractionDoc = InferSchemaType<typeof interactionSchema>;

export const Interaction: Model<InteractionDoc> =
  models.Interaction ?? model<InteractionDoc>("Interaction", interactionSchema);
