import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";

/**
 * "Avisarme cuando se libere": una persona con cuenta pide que le avisen cuando un alquiler hoy no disponible vuelva a estarlo.
 * Uno por persona y propiedad (se activa y se desactiva con un toque). `notifiedAt` evita repetir el aviso por un mismo cambio.
 */
const availabilityWatchSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    propertyId: { type: Schema.Types.ObjectId, ref: "Property", required: true },
    notifiedAt: { type: Date },
  },
  { timestamps: true }
);

availabilityWatchSchema.index({ userId: 1, propertyId: 1 }, { unique: true });
availabilityWatchSchema.index({ propertyId: 1 });

export type AvailabilityWatchDoc = InferSchemaType<typeof availabilityWatchSchema>;

export const AvailabilityWatch: Model<AvailabilityWatchDoc> = models.AvailabilityWatch ?? model<AvailabilityWatchDoc>("AvailabilityWatch", availabilityWatchSchema);
