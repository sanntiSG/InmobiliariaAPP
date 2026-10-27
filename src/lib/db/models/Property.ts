import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";
import { geoPointSchema } from "./_shared";
import {
  OPERATIONS,
  PROPERTY_TYPES,
  PROPERTY_STATUSES,
  AMENITIES,
  CURRENCIES,
} from "@/config/filters";
import { PRICE_PERIODS } from "@/config/pricing";
import { AVAILABILITY_STATES } from "@/lib/availability";

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

/**
 * Video de YouTube embebido en la publicación (Shorts, recorridos, etc.). Se
 * guarda sólo el `videoId`: `url` y `thumbnail` los deriva el servidor al
 * guardar (nunca se confía en una URL enviada por el cliente).
 */
const videoSchema = new Schema(
  {
    url: { type: String, required: true },
    thumbnail: { type: String },
    provider: { type: String, enum: ["upload", "youtube", "vimeo"], default: "youtube" },
    videoId: { type: String },
    title: { type: String, maxlength: 120 },
    /** Los Shorts son verticales (9:16); el resto, horizontales (16:9). */
    orientation: { type: String, enum: ["vertical", "horizontal"], default: "horizontal" },
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
const tourLinkSchema = new Schema(
  {
    id: { type: String, required: true },
    targetId: { type: String, required: true },
    label: { type: String, maxlength: 40, default: "" },
    yaw: { type: Number, required: true },
    pitch: { type: Number, required: true },
    arrivalYaw: { type: Number, default: 0 },
    arrivalPitch: { type: Number, default: 0 },
  },
  { _id: false }
);

const tourEntrySchema = new Schema(
  {
    /** Id estable de la escena — lo referencian los `links` de otras escenas. Ausente en documentos legacy. */
    id: { type: String },
    /** Opcional — ej. "Living", "Fachada". Si falta, la UI usa "Recorrido N". */
    label: { type: String, maxlength: 60 },
    /** URL (Cloudinary) de la foto 360°. */
    photo360Url: { type: String, required: true },
    /** Marcadores hacia otras escenas (recorrido navegable). */
    links: { type: [tourLinkSchema], default: [] },
    /** Posición del nodo en la vista de grafo del editor. */
    graph: { type: new Schema({ x: Number, y: Number }, { _id: false }) },
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
      /** A qué período corresponde el monto (ver `config/pricing.ts`): venta = total, alquiler = mensual, temporal = noche/día/semana/quincena/mes. */
      period: { type: String, enum: PRICE_PERIODS, default: "total" },
      /**
       * El monto llevado a una noche (sólo alquiler): permite filtrar y ordenar alquileres temporales cobrados por períodos
       * distintos con una regla clara. Se recalcula en cada guardado (`config/pricing.ts`), nunca lo manda el cliente.
       */
      perNight: { type: Number },
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
      /** Distancia aproximada a la playa en metros (0 = frente al mar). Un número, no texto: sirve para filtrar. */
      beachDistance: { type: Number, min: 0 },
    },
    /**
     * Disponibilidad de un ALQUILER (tradicional o temporal), separada de si la publicación está activa: una propiedad alquilada
     * sigue publicada y visible. Fechas `YYYY-MM-DD` (ver `lib/availability.ts`). No es un sistema de reservas.
     */
    availability: {
      state: { type: String, enum: AVAILABILITY_STATES, default: "available" },
      blocked: {
        type: [
          new Schema(
            {
              from: { type: String, required: true },
              to: { type: String, required: true },
              note: { type: String, maxlength: 80 },
            },
            { _id: false }
          ),
        ],
        default: [],
      },
      /** Último estado calculado ("hoy"): sirve para avisar sólo cuando CAMBIA (ver `lib/availability-sweep.ts`). */
      current: { type: String, enum: AVAILABILITY_STATES, default: "available" },
    },
    amenities: [{ type: String, enum: AMENITIES }],

    media: {
      images: [imageSchema],
      videos: [videoSchema],
      floorPlans: [imageSchema],
      tours: [tourEntrySchema],
      /** Recorrido navegable entre las escenas de `tours`. */
      virtualTour: {
        enabled: { type: Boolean, default: false },
        startId: { type: String },
      },
      /** Desnormalizado a partir de `tours.length > 0` — evita inspeccionar el array en cada query/filtro (ver `property-query.ts`, `lib/intelligence`). */
      hasTour3d: { type: Boolean, default: false, index: true },
      /**
       * Portada viva (opcional): una foto en varios estados (día, noche, lluvia…) que se anima en la ficha. Es una COPIA
       * de la portada verificada de `AmbientCover` (el navegador sólo manda `coverId`, `states` y `start`; ver
       * `lib/ambient/attach.ts`). Las tarjetas muestran `poster`, nunca cargan el reproductor.
       */
      ambient: {
        coverId: { type: String },
        /** Carpeta de archivos, con `/` final y sin versión. */
        baseUrl: { type: String },
        /** Manifest saneado (≈10 KB): no entra en las proyecciones de tarjetas. */
        manifest: { type: Schema.Types.Mixed },
        /** Estados que la inmobiliaria dejó activos (subconjunto de los del manifest). */
        states: [{ type: String }],
        /** `"auto"` = según la hora de quien mira, o el id de un estado. */
        start: { type: String, default: "auto" },
        poster: {
          url: { type: String },
          providerId: { type: String },
          width: { type: Number },
          height: { type: Number },
        },
      },
      /** Desnormalizado: hay portada viva. Igual que `hasTour3d`, para filtros, inteligencia y asesor. */
      hasAmbientCover: { type: Boolean, default: false, index: true },
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

    /**
     * Marca de un seed de demostración (por ejemplo "vacacional-v1") y su clave única dentro de él. Es lo que permite que un
     * seed no cree duplicados y que su comando inverso borre SÓLO lo que él creó. Las propiedades reales no la tienen.
     */
    seedTag: { type: String, maxlength: 60 },
    seedKey: { type: String, maxlength: 120 },
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
// Un seed no puede crear dos veces la misma propiedad; sólo indexa las que tienen `seedKey`.
propertySchema.index({ seedKey: 1 }, { unique: true, partialFilterExpression: { seedKey: { $type: "string" } } });
propertySchema.index({ seedTag: 1 }, { partialFilterExpression: { seedTag: { $type: "string" } } });
// Los alquileres se filtran por su equivalente por noche y por distancia a la playa.
propertySchema.index({ status: 1, operation: 1, "price.perNight": 1 });

export type PropertyDoc = InferSchemaType<typeof propertySchema>;

export const Property: Model<PropertyDoc> =
  models.Property ?? model<PropertyDoc>("Property", propertySchema);
