import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";

/** Un usuario que sigue a una inmobiliaria para enterarse de sus propiedades nuevas. */
const agencyFollowSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    agencyId: { type: Schema.Types.ObjectId, ref: "Agency", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

agencyFollowSchema.index({ userId: 1, agencyId: 1 }, { unique: true });
// "Quiénes siguen a esta inmobiliaria" — avisos de propiedades nuevas.
agencyFollowSchema.index({ agencyId: 1 });

export type AgencyFollowDoc = InferSchemaType<typeof agencyFollowSchema>;

export const AgencyFollow: Model<AgencyFollowDoc> =
  models.AgencyFollow ?? model<AgencyFollowDoc>("AgencyFollow", agencyFollowSchema);
