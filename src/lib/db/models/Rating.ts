import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";

const ratingSchema = new Schema(
  {
    propertyId: { type: Schema.Types.ObjectId, ref: "Property", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    value: { type: Number, required: true, min: 1, max: 5 },
  },
  { timestamps: true }
);

// Un usuario rankea una propiedad una sola vez (upsert al re-votar).
ratingSchema.index({ propertyId: 1, userId: 1 }, { unique: true });

export type RatingDoc = InferSchemaType<typeof ratingSchema>;

export const Rating: Model<RatingDoc> =
  models.Rating ?? model<RatingDoc>("Rating", ratingSchema);
