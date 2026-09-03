import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";

export const USER_ROLES = [
  "visitor",
  "user",
  "agency_owner",
  "agency_agent",
  "admin",
] as const;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    /** null cuando el usuario se autentica por un proveedor externo (futuro). */
    passwordHash: { type: String, default: null },
    image: { type: String },

    role: { type: String, enum: USER_ROLES, default: "user", index: true },
    /** Solo presente si role es agency_owner/agency_agent. */
    agencyId: { type: Schema.Types.ObjectId, ref: "Agency", default: null },

    /**
     * Preferencias explícitas + implícitas (por interacción) que alimentan
     * el recomendador de lógica tradicional. Sin IA de pago.
     */
    preferences: {
      operations: [{ type: String }],
      propertyTypes: [{ type: String }],
      locations: [{ type: String }], // barrios/ciudades de interés
      priceMin: { type: Number },
      priceMax: { type: Number },
      minRooms: { type: Number },
      amenities: [{ type: String }],
    },

    emailVerified: { type: Date, default: null },
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof userSchema>;

export const User: Model<UserDoc> = models.User ?? model<UserDoc>("User", userSchema);
