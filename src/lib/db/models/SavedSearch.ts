import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";

/** Búsqueda guardada por un usuario — insumo para notificar "new_match". */
const savedSearchSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, default: "" },
    filters: {
      operation: { type: String },
      type: [{ type: String }],
      priceMin: { type: Number },
      priceMax: { type: Number },
      minRooms: { type: Number },
      neighborhoods: [{ type: String }],
      amenities: [{ type: String }],
    },
    notify: { type: Boolean, default: true },
    lastNotifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type SavedSearchDoc = InferSchemaType<typeof savedSearchSchema>;

export const SavedSearch: Model<SavedSearchDoc> =
  models.SavedSearch ?? model<SavedSearchDoc>("SavedSearch", savedSearchSchema);
