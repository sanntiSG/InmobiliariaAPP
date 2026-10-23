import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";

export const AMBIENT_COVER_STATUSES = ["pending", "ready"] as const;

/**
 * Una portada viva subida por una inmobiliaria. Sirve de registro entre la subida y el guardado de la propiedad:
 * `pending` = el servidor ya validó el manifest y firmó la subida de los archivos; `ready` = ya verificó los bytes
 * de cada uno y generó el póster. `attachedTo` es la propiedad que la usa (o `null` si todavía no se guardó): las que
 * quedan sin usar más de un día se limpian solas.
 *
 * El manifest guardado es SIEMPRE la copia saneada (ver `sanitizeManifest`), nunca el que mandó el navegador.
 */
const ambientCoverSchema = new Schema(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: "Agency", required: true, index: true },
    coverId: { type: String, required: true, unique: true },
    status: { type: String, enum: AMBIENT_COVER_STATUSES, default: "pending" },
    /** Manifest saneado (≈10 KB). */
    manifest: { type: Schema.Types.Mixed, required: true },
    /** URL de la carpeta de archivos, con `/` final y sin versión. */
    baseUrl: { type: String, required: true },
    /** Peso total de los archivos (la lista de archivos sale del manifest: `referencedFiles`). */
    bytes: { type: Number, default: 0 },
    /** Imagen común del estado inicial: la usan las tarjetas y la imagen para compartir. */
    poster: {
      url: { type: String },
      providerId: { type: String },
      width: { type: Number },
      height: { type: Number },
    },
    attachedTo: { type: Schema.Types.ObjectId, ref: "Property", default: null },
  },
  { timestamps: true }
);

// Barrido de las que quedaron sin usar.
ambientCoverSchema.index({ attachedTo: 1, createdAt: 1 });

export type AmbientCoverDoc = InferSchemaType<typeof ambientCoverSchema>;

export const AmbientCover: Model<AmbientCoverDoc> =
  models.AmbientCover ?? model<AmbientCoverDoc>("AmbientCover", ambientCoverSchema);
