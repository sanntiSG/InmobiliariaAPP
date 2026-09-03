import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";
import { geoPointSchema } from "./_shared";

const agencySchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true, lowercase: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    logo: { type: String },
    cover: { type: String },
    description: { type: String, maxlength: 2000 },

    contact: {
      phone: { type: String },
      whatsapp: { type: String },
      email: { type: String },
      website: { type: String },
    },

    address: {
      street: { type: String },
      city: { type: String },
      province: { type: String },
      country: { type: String, default: "Argentina" },
    },
    /** Ubicación de la oficina/sede — no confundir con la de cada propiedad. */
    location: { type: geoPointSchema },

    branding: {
      accentColor: { type: String, default: "#2b7fff" },
    },

    status: {
      type: String,
      enum: ["active", "suspended", "pending"],
      default: "pending",
      index: true,
    },

    /** Usuarios con rol agency_owner / agency_agent para este tenant. */
    owners: [{ type: Schema.Types.ObjectId, ref: "User" }],

    /** Contadores desnormalizados — se recalculan por lógica tradicional, no IA. */
    stats: {
      propertiesCount: { type: Number, default: 0 },
      viewsTotal: { type: Number, default: 0 },
      likesTotal: { type: Number, default: 0 },
      savesTotal: { type: Number, default: 0 },
      commentsTotal: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

agencySchema.index({ location: "2dsphere" });
agencySchema.index({ name: "text", description: "text" });

export type AgencyDoc = InferSchemaType<typeof agencySchema>;

export const Agency: Model<AgencyDoc> =
  models.Agency ?? model<AgencyDoc>("Agency", agencySchema);
