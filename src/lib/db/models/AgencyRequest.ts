import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";

export const AGENCY_REQUEST_STATUSES = ["pending", "approved", "rejected"] as const;

/**
 * Solicitud de una persona (con cuenta) para gestionar una inmobiliaria.
 * Complementa —no reemplaza— el contacto por WhatsApp: el admin habla con la
 * persona, y después aprueba o rechaza desde /admin/solicitudes. Aprobar usa
 * `grantAgencyAccess` (mismo flujo que "Accesos").
 */
const agencyRequestSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    /** Copia del email al momento de pedir — es el que se autoriza al aprobar. */
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    agencyName: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    zone: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, default: "", trim: true, maxlength: 500 },

    status: { type: String, enum: AGENCY_REQUEST_STATUSES, default: "pending", index: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: "", trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

agencyRequestSchema.index({ status: 1, createdAt: -1 });
// A lo sumo una solicitud pendiente por usuario (también ante dos clics simultáneos).
agencyRequestSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: "pending" }, name: "one_pending_per_user" }
);

export type AgencyRequestDoc = InferSchemaType<typeof agencyRequestSchema>;

export const AgencyRequest: Model<AgencyRequestDoc> =
  models.AgencyRequest ?? model<AgencyRequestDoc>("AgencyRequest", agencyRequestSchema);
