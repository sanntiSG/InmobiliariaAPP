import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";

export const SOCIAL_MODES = ["auto", "manual"] as const;

/**
 * "Receta" de una publicación: no se guarda ninguna imagen, el PNG se dibuja
 * al vuelo a partir de esto (propiedad + foto + template).
 */
const recipeSchema = new Schema(
  {
    propertyId: { type: Schema.Types.ObjectId, ref: "Property", required: true },
    photoUrl: { type: String, required: true },
    templateId: { type: Number, required: true },
    /** Día (hora Argentina) para el que está pensada. */
    day: { type: Date, required: true },
    /** Cambia con cada generación: invalida la caché de la imagen. */
    version: { type: Number, default: 1 },
  },
  { _id: false }
);

/** Contenido para redes de una inmobiliaria: publicación de hoy + próxima. */
const socialContentSchema = new Schema(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: "Agency", required: true, unique: true },
    /** `null` hasta que la inmobiliaria elige cómo prepararlas. */
    mode: { type: String, enum: SOCIAL_MODES, default: null },
    current: { type: recipeSchema, default: null },
    next: { type: recipeSchema, default: null },
    /** Regeneraciones consumidas en `day` (se reinicia al cambiar el día). */
    regen: {
      day: { type: Date, default: null },
      count: { type: Number, default: 0 },
    },
    /** Últimos usados, para no repetir enseguida. */
    recent: {
      propertyIds: { type: [String], default: [] },
      photoUrls: { type: [String], default: [] },
      templateIds: { type: [Number], default: [] },
    },
  },
  { timestamps: true }
);

export type SocialContentDoc = InferSchemaType<typeof socialContentSchema>;
export type SocialRecipe = NonNullable<SocialContentDoc["current"]>;

export const SocialContent: Model<SocialContentDoc> =
  models.SocialContent ?? model<SocialContentDoc>("SocialContent", socialContentSchema);
