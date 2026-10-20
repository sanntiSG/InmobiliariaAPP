import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";
import { USER_ROLES } from "./User";

/**
 * Qué clase de acción se registró. El detalle fino (qué campo cambió) vive en
 * `changes`; `kind` sólo agrupa para poder filtrar y redactar la frase.
 */
export const ACTIVITY_KINDS = [
  "property_created",
  "property_updated",
  "property_deleted",
  "agency_created",
  "agency_updated",
  "youtube_linked",
  "youtube_unlinked",
  "lead_stage_changed",
  "lead_note_added",
  "social_mode_changed",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/**
 * Un cambio puntual dentro de una acción. Los valores son siempre primitivos
 * y acotados (ver `lib/activity/diff.ts`): nunca se guarda un documento entero
 * ni datos personales de clientes.
 */
const changeSchema = new Schema(
  {
    /** Clave estable del campo: "price", "description", "photos", "address.neighborhood"… */
    field: { type: String, required: true, maxlength: 60 },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    /** "USD", "caracteres", "fotos"… */
    unit: { type: String, maxlength: 20 },
    /** Texto corto de apoyo (extracto, "+2 / -1", "pin movido ~120 m"). */
    note: { type: String, maxlength: 300 },
  },
  { _id: false }
);

/**
 * Bitácora de todo lo que hace la inmobiliaria (o el admin en su nombre) sobre
 * sus datos. Alimenta al asesor: es lo que le permite explicar "tus visitas
 * subieron desde que bajaste el precio" sin adivinar. Se escribe de forma
 * best-effort (nunca rompe la acción original) y se borra sola a los 2 años.
 */
const activityLogSchema = new Schema(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: "Agency", required: true },
    propertyId: { type: Schema.Types.ObjectId, ref: "Property", default: null },
    /** Se guarda el título para que la entrada siga siendo legible si la propiedad se borra. */
    propertyTitle: { type: String, maxlength: 160 },
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    actorRole: { type: String, enum: USER_ROLES },
    kind: { type: String, enum: ACTIVITY_KINDS, required: true },
    changes: { type: [changeSchema], default: [] },
    /** Claves de `changes.field`, desnormalizadas para indexar ("¿cuándo toqué el precio?"). */
    fields: { type: [String], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

activityLogSchema.index({ agencyId: 1, createdAt: -1 });
activityLogSchema.index({ propertyId: 1, createdAt: -1 });
activityLogSchema.index({ agencyId: 1, fields: 1, createdAt: -1 });
activityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 730 });

export type ActivityLogDoc = InferSchemaType<typeof activityLogSchema>;

export const ActivityLog: Model<ActivityLogDoc> =
  models.ActivityLog ?? model<ActivityLogDoc>("ActivityLog", activityLogSchema);
