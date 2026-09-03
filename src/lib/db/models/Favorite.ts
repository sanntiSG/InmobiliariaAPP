import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";

const favoriteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: "Property", required: true },
  },
  { timestamps: true }
);

favoriteSchema.index({ userId: 1, propertyId: 1 }, { unique: true });

export type FavoriteDoc = InferSchemaType<typeof favoriteSchema>;

export const Favorite: Model<FavoriteDoc> =
  models.Favorite ?? model<FavoriteDoc>("Favorite", favoriteSchema);
