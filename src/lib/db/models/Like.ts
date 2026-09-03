import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";

/**
 * Modelo dedicado para poder responder "¿este usuario ya likeó esto?" en
 * O(1) — un Like/unlike derivado únicamente del log de Interaction
 * requeriría escanear el historial completo por usuario+propiedad.
 */
const likeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: "Property", required: true },
  },
  { timestamps: true }
);

likeSchema.index({ userId: 1, propertyId: 1 }, { unique: true });

export type LikeDoc = InferSchemaType<typeof likeSchema>;

export const Like: Model<LikeDoc> = models.Like ?? model<LikeDoc>("Like", likeSchema);
