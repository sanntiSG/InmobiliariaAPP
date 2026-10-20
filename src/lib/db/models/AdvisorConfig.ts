import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";

const clipSchema = new Schema({ name: { type: String, required: true, maxlength: 60 }, duration: { type: Number, default: 0 } }, { _id: false });

/**
 * Todo lo que define cómo se ve y se comporta el asesor. Existe en dos copias
 * (`draft` y `published`): el admin edita el borrador, lo prueba y recién
 * después lo publica; la gente siempre ve `published`.
 */
const contentSchema = new Schema(
  {
    name: { type: String, default: "", maxlength: 40 },
    description: { type: String, default: "", maxlength: 300 },
    enabled: {
      agency: { type: Boolean, default: true },
      explorer: { type: Boolean, default: true },
    },
    model: {
      /** `bundled` = el modelo incluido en el repositorio; `uploaded` = uno que subió el admin. */
      source: { type: String, enum: ["bundled", "uploaded"], default: "bundled" },
      url: { type: String, default: "/advisor/agent.glb", maxlength: 500 },
      providerId: { type: String, maxlength: 300 },
      bytes: { type: Number },
      label: { type: String, maxlength: 80 },
    },
    /** Animaciones detectadas en el modelo (las informa el navegador del admin al cargarlo). */
    clips: { type: [clipSchema], default: [] },
    /** Qué animación cumple cada papel — siempre por NOMBRE, nunca por posición. */
    roles: {
      idle: { type: String, default: "Normal", maxlength: 60 },
      talking: { type: [String], default: ["Hablando"] },
      surprised: { type: [String], default: ["Sorprendido"] },
      tap: { type: [String], default: ["Parpadeando", "Asintiendo", "Feliz"] },
    },
    /** Animaciones apagadas en todos los casos. */
    disabled: { type: [String], default: [] },
    framing: {
      distance: { type: Number, default: 1 },
      height: { type: Number, default: 0 },
      rotationY: { type: Number, default: 0 },
      scale: { type: Number, default: 1 },
      light: { type: Number, default: 1 },
    },
    /** Imagen del lanzador y de la carga (https de Cloudinary o `/…` local). */
    poster: { type: String, maxlength: 500 },
  },
  { _id: false }
);

const libraryEntrySchema = new Schema(
  {
    url: { type: String, required: true, maxlength: 500 },
    providerId: { type: String, required: true, maxlength: 300 },
    bytes: { type: Number, default: 0 },
    label: { type: String, maxlength: 80 },
    clips: { type: [clipSchema], default: [] },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/** Un único documento (`key: "default"`): la plataforma tiene un solo asesor. */
const advisorConfigSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    draft: { type: contentSchema, default: () => ({}) },
    published: { type: contentSchema, default: () => ({}) },
    /** Modelos subidos por el admin (tope chico: son archivos de varios MB). */
    library: { type: [libraryEntrySchema], default: [] },
    publishedAt: { type: Date },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export type AdvisorConfigDoc = InferSchemaType<typeof advisorConfigSchema>;

export const AdvisorConfig: Model<AdvisorConfigDoc> =
  models.AdvisorConfig ?? model<AdvisorConfigDoc>("AdvisorConfig", advisorConfigSchema);
