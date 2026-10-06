import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";
import { LEAD_STATUSES } from "@/lib/leads/status";

/**
 * Cliente potencial: alguien que consultó por una propiedad. Pertenece a una
 * sola inmobiliaria (`agencyId`) y sólo ella —o el admin— puede verlo: toda
 * consulta a esta colección desde el dashboard filtra por `agencyId`.
 */
const leadSchema = new Schema(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: "Agency", required: true },
    propertyId: { type: Schema.Types.ObjectId, ref: "Property", required: true },
    /** Cuenta del interesado, si estaba logueado al consultar. */
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },

    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, trim: true, lowercase: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 30 },

    /** Mensajes que fue enviando desde la ficha (una nueva consulta del mismo contacto se suma acá). */
    messages: [
      {
        text: { type: String, required: true, maxlength: 1000 },
        at: { type: Date, default: Date.now },
        _id: false,
      },
    ],

    status: { type: String, enum: LEAD_STATUSES, default: "nuevo" },
    visitRequested: { type: Boolean, default: false },
    visitDone: { type: Boolean, default: false },
    offerMade: { type: Boolean, default: false },
    /** Última vez que la inmobiliaria registró un contacto (cambio de etapa o nota). */
    lastContactAt: { type: Date, default: null },

    history: [
      {
        status: { type: String, enum: LEAD_STATUSES, required: true },
        at: { type: Date, default: Date.now },
        by: { type: Schema.Types.ObjectId, ref: "User", default: null },
        _id: false,
      },
    ],
    notes: [
      {
        text: { type: String, required: true, maxlength: 1000 },
        at: { type: Date, default: Date.now },
        by: { type: Schema.Types.ObjectId, ref: "User", default: null },
        _id: false,
      },
    ],
  },
  { timestamps: true }
);

leadSchema.index({ agencyId: 1, status: 1, updatedAt: -1 });
leadSchema.index({ agencyId: 1, propertyId: 1 });
leadSchema.index({ agencyId: 1, createdAt: -1 });

export type LeadDoc = InferSchemaType<typeof leadSchema>;

export const Lead: Model<LeadDoc> = models.Lead ?? model<LeadDoc>("Lead", leadSchema);
