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
    /** null cuando el usuario se autentica por un proveedor externo (Google). */
    passwordHash: { type: String, default: null },
    image: { type: String },

    /** Proveedor de autenticación usado al crear la cuenta. */
    provider: { type: String, enum: ["credentials", "google"], default: "credentials" },
    /**
     * ID único de Google — solo presente si provider === "google". Sin
     * `default: null` a propósito: un índice `sparse` sólo excluye
     * documentos donde el campo directamente NO EXISTE, no donde vale
     * `null` — con `default: null` todo usuario creado por contraseña
     * quedaba con `googleId: null` escrito e indexado, y el segundo
     * `User.create()` por contraseña tiraba `E11000 duplicate key`. El
     * índice real (con `partialFilterExpression`) se declara más abajo.
     */
    googleId: { type: String },

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

// Único, pero sólo sobre los documentos que de verdad tienen un googleId de
// tipo string — así los usuarios por contraseña (sin googleId) nunca chocan
// entre sí. Ver el comentario en el campo `googleId` arriba.
userSchema.index({ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: "string" } } });

export type UserDoc = InferSchemaType<typeof userSchema>;

export const User: Model<UserDoc> = models.User ?? model<UserDoc>("User", userSchema);
