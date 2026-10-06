import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";

const weightedKey = new Schema({ key: String, weight: Number }, { _id: false });

/**
 * Perfil de gustos de un usuario, calculado a partir de su actividad real
 * (ver `lib/intelligence/user-profile.ts`) y cacheado acá. Los campos `top*`
 * están indexados para poder encontrar rápido a quién le puede interesar una
 * propiedad nueva sin recorrer todos los perfiles.
 */
const userTasteProfileSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  computedAt: { type: Date, default: Date.now },
  /** Cantidad de propiedades distintas con las que interactuó (cuán confiable es el perfil). */
  sampleSize: { type: Number, default: 0 },
  totalWeight: { type: Number, default: 0 },
  /** Propiedades guardadas al calcular el perfil (decide el texto "similar a las que guardaste"). */
  savedCount: { type: Number, default: 0 },

  neighborhoods: { type: [weightedKey], default: [] },
  types: { type: [weightedKey], default: [] },
  operations: { type: [weightedKey], default: [] },
  amenities: { type: [weightedKey], default: [] },
  /** Rango de precio habitual por operación y moneda (clave `operacion:moneda`). */
  prices: {
    type: [new Schema({ key: String, median: Number, low: Number, high: Number }, { _id: false })],
    default: [],
  },
  bedrooms: { type: Number, default: null },
  area: { type: Number, default: null },
  centroids: {
    type: [new Schema({ lat: Number, lng: Number, weight: Number }, { _id: false })],
    default: [],
  },

  topNeighborhoods: { type: [String], default: [], index: true },
  topTypes: { type: [String], default: [] },
  topOperations: { type: [String], default: [] },
});

export type UserTasteProfileDoc = InferSchemaType<typeof userTasteProfileSchema>;

export const UserTasteProfile: Model<UserTasteProfileDoc> =
  models.UserTasteProfile ?? model<UserTasteProfileDoc>("UserTasteProfile", userTasteProfileSchema);
