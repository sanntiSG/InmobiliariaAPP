import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";

/**
 * Emails autorizados por el admin para gestionar una inmobiliaria — es la
 * única fuente de verdad de permisos de agencia (ver `resolveAccessForEmail`
 * en `src/lib/auth/resolve-access.ts`).
 *
 * Flujo A — el admin ya creó la inmobiliaria: la autoriza con `agencyId` seteado.
 * Flujo B — el admin sólo habilita el mail (`agencyId: null`): cuando esa
 *   persona hace login queda en estado `awaiting_agency` y debe crear su
 *   propia inmobiliaria en `/publicar` (`POST /api/agency/onboarding`).
 *
 * En ambos casos, al hacer login con Google el callback `signIn` (`src/auth.ts`)
 * asigna `role` + `agencyId` al usuario según este registro.
 */
const allowedEmailSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    /** Inmobiliaria a la que se vincula este email. `null` = la crea el propio usuario (ver Flujo B). */
    agencyId: { type: Schema.Types.ObjectId, ref: "Agency", default: null },
    /** Rol que recibe el usuario al activarse este permiso. */
    role: {
      type: String,
      enum: ["agency_owner", "agency_agent"],
      default: "agency_owner",
    },
    /** Admin que concedió el permiso. */
    grantedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    /**
     * Estado del permiso:
     * - pending: nunca inició sesión.
     * - awaiting_agency: ya inició sesión pero todavía no tiene inmobiliaria (Flujo B).
     * - active: ya inició sesión y tiene inmobiliaria asignada.
     */
    status: {
      type: String,
      enum: ["pending", "awaiting_agency", "active"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true }
);

export type AllowedEmailDoc = InferSchemaType<typeof allowedEmailSchema>;

export const AllowedEmail: Model<AllowedEmailDoc> =
  models.AllowedEmail ?? model<AllowedEmailDoc>("AllowedEmail", allowedEmailSchema);
