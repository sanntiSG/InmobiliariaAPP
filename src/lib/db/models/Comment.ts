import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";

const commentSchema = new Schema(
  {
    propertyId: { type: Schema.Types.ObjectId, ref: "Property", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, trim: true, maxlength: 1000 },
    /** Soporte simple de respuestas anidadas (un solo nivel). */
    parentId: { type: Schema.Types.ObjectId, ref: "Comment", default: null },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

commentSchema.index({ propertyId: 1, createdAt: -1 });

export type CommentDoc = InferSchemaType<typeof commentSchema>;

export const Comment: Model<CommentDoc> =
  models.Comment ?? model<CommentDoc>("Comment", commentSchema);
