import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";
import { geoPointSchema } from "./_shared";
import {
  OPERATIONS,
  PROPERTY_TYPES,
  PROPERTY_STATUSES,
  AMENITIES,
  CURRENCIES,
} from "@/config/filters";

const priceHistoryEntrySchema = new Schema(
  {
    amount: { type: Number, required: true },
    currency: { type: String, enum: CURRENCIES, required: true },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const imageSchema = new Schema(
  {
    url: { type: String, required: true },
    alt: { type: String, default: "" },
    order: { type: Number, default: 0 },
    /** id del asset en el storage provider (Cloudinary), para poder borrarlo. */
    providerId: { type: String },
    width: { type: Number },
    height: { type: Number },
  },
  { _id: false }
);

const videoSchema = new Schema(
  {
    url: { type: String, required: true },
    thumbnail: { type: String },
    provider: { type: String, enum: ["upload", "youtube", "vimeo"], default: "upload" },
  },
  { _id: false }
);

/**
 * Slot del Digital Twin / recorrido 3D. Es completamente opcional: una
 * propiedad simplemente lo tiene (`enabled: true`) o no.
 *
 * `kind` determina cómo se renderiza:
 * - "iframe": embed hosteado por el proveedor (Matterport, el visor propio
 *   de Polycam en poly.cam/capture/[id]/embed, Kuula, etc.) vía `embedUrl`.
 * - "mesh": un archivo 3D propio (glb/gltf/usdz, ej. exportado de Polycam)
 *   servido por nuestro storage y renderizado con <model-viewer> — ver
 *   `meshUrl`/`meshFormat`.
 *
 * `provider` es solo metadata/branding, no afecta el render.
 */
const tour3dSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    kind: { type: String, enum: ["iframe", "mesh"], default: "iframe" },
    provider: { type: String, enum: ["matterport", "polycam", "kuula", "custom"], default: "polycam" },
    modelId: { type: String },
    embedUrl: { type: String },
    meshUrl: { type: String },
    meshFormat: { type: String, enum: ["glb", "gltf", "usdz"] },
    thumbnail: { type: String },
  },
  { _id: false }
);

const propertySchema = new Schema(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: "Agency", required: true, index: true },
    slug: { type: String, required: true, unique: true, index: true },

    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, maxlength: 5000, default: "" },

    operation: { type: String, enum: OPERATIONS, required: true, index: true },
    type: { type: String, enum: PROPERTY_TYPES, required: true, index: true },
    status: {
      type: String,
      enum: PROPERTY_STATUSES,
      default: "draft",
      index: true,
    },

    price: {
      amount: { type: Number, required: true },
      currency: { type: String, enum: CURRENCIES, default: "USD" },
      expenses: { type: Number, default: 0 },
      period: { type: String, enum: ["total", "mensual"], default: "total" },
    },
    /** Historial de cambios de precio — dispara la notificación "bajó de precio". */
    priceHistory: [priceHistoryEntrySchema],

    address: {
      street: { type: String },
      number: { type: String },
      neighborhood: { type: String, index: true },
      city: { type: String, required: true },
      province: { type: String },
      country: { type: String, default: "Argentina" },
      /** Si es false, la API difumina `location` antes de exponerla. */
      showExact: { type: Boolean, default: true },
    },
    location: { type: geoPointSchema, required: true },

    features: {
      rooms: { type: Number },
      bedrooms: { type: Number },
      bathrooms: { type: Number },
      garages: { type: Number, default: 0 },
      coveredArea: { type: Number },
      totalArea: { type: Number },
      age: { type: Number },
      floor: { type: Number },
      orientation: { type: String },
    },
    amenities: [{ type: String, enum: AMENITIES }],

    media: {
      images: [imageSchema],
      videos: [videoSchema],
      floorPlans: [imageSchema],
      tour3d: { type: tour3dSchema, default: () => ({ enabled: false }) },
    },

    /** Contadores desnormalizados, actualizados a partir de `Interaction`. */
    stats: {
      views: { type: Number, default: 0 },
      likes: { type: Number, default: 0 },
      saves: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      ratingAvg: { type: Number, default: 0 },
      ratingCount: { type: Number, default: 0 },
    },

    publishedAt: { type: Date },
  },
  { timestamps: true }
);

propertySchema.index({ location: "2dsphere" });
propertySchema.index({ status: 1, publishedAt: -1 });
propertySchema.index({ agencyId: 1, status: 1 });
propertySchema.index({ "price.amount": 1 });
propertySchema.index({ title: "text", description: "text", "address.neighborhood": "text" });

export type PropertyDoc = InferSchemaType<typeof propertySchema>;

export const Property: Model<PropertyDoc> =
  models.Property ?? model<PropertyDoc>("Property", propertySchema);
