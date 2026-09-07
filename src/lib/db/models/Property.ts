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
 * Un recorrido 360° — una foto equirectangular subida por la propia
 * inmobiliaria (imagen común, JPEG/PNG, sube por el mismo camino que las
 * fotos de la propiedad — `/api/dashboard/upload`, Cloudinary) y
 * renderizada con nuestro propio visor (`Photo360Viewer`, Photo Sphere
 * Viewer vía Three.js/WebGL). Una propiedad puede tener varios
 * (`media.tours`, ver más abajo) — distintos ambientes, por ejemplo.
 */
const tourEntrySchema = new Schema(
  {
    /** Opcional — ej. "Living", "Fachada". Si falta, la UI usa "Recorrido N". */
    label: { type: String, maxlength: 60 },
    /** URL (Cloudinary) de la foto 360°. */
    photo360Url: { type: String, required: true },
  },
  { _id: false }
);

const propertySchema = new Schema(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: "Agency", required: true, index: true },
    // `unique: true` ya crea su propio índice — agregar `index: true` acá
    // hacía que Mongoose declarara dos índices distintos sobre el mismo
    // campo (warning "Duplicate schema index" al levantar el server).
    slug: { type: String, required: true, unique: true },

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
      tours: [tourEntrySchema],
      /** Desnormalizado a partir de `tours.length > 0` — evita inspeccionar el array en cada query/filtro (ver `property-query.ts`, `agency-stats.ts`). */
      hasTour3d: { type: Boolean, default: false, index: true },
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

// El mapa filtra siempre por `status` + `location` juntos (ver
// buildPropertyQuery + bboxToGeoWithin) — sin este compuesto, Mongo elige
// uno de los dos índices y filtra el otro campo en memoria. Un índice
// 2dsphere no puede ser el segundo campo de un compuesto (limitación de
// Mongo), así que va primero.
propertySchema.index({ location: "2dsphere", status: 1 });
propertySchema.index({ status: 1, publishedAt: -1 });
propertySchema.index({ agencyId: 1, status: 1 });
// El listado ordena por precio con el mismo filtro de `status` siempre activo.
propertySchema.index({ status: 1, "price.amount": 1 });
propertySchema.index({ title: "text", description: "text", "address.neighborhood": "text" });

export type PropertyDoc = InferSchemaType<typeof propertySchema>;

export const Property: Model<PropertyDoc> =
  models.Property ?? model<PropertyDoc>("Property", propertySchema);
