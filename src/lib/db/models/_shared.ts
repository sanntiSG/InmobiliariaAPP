import { Schema } from "mongoose";

/** Punto GeoJSON reutilizado por Agency y Property. Orden: [lng, lat]. */
export const geoPointSchema = new Schema(
  {
    type: { type: String, enum: ["Point"], default: "Point", required: true },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (v: number[]) => v.length === 2,
        message: "coordinates debe ser [lng, lat]",
      },
    },
  },
  { _id: false }
);
