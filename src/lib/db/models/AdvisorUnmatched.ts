import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";

/**
 * Preguntas que el asesor no pudo interpretar (o dudó), guardadas de forma
 * ANÓNIMA para que el admin vea qué se pregunta y mejore el motor: sólo el
 * texto enmascarado y el modo; nunca el usuario, la inmobiliaria ni la
 * conversación. Una fila por pregunta distinta (con contador) y se borra sola
 * 90 días después de la última vez.
 */
const advisorUnmatchedSchema = new Schema({
  /** Hash del texto normalizado: agrupa variaciones triviales (mayúsculas, tildes, signos). */
  hash: { type: String, required: true, unique: true },
  text: { type: String, required: true, maxlength: 140 },
  mode: { type: String, enum: ["agency", "explorer"], required: true },
  kind: { type: String, enum: ["unknown", "clarify"], required: true },
  count: { type: Number, default: 1 },
  firstAt: { type: Date, default: Date.now },
  lastAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

advisorUnmatchedSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
advisorUnmatchedSchema.index({ mode: 1, count: -1 });

export type AdvisorUnmatchedDoc = InferSchemaType<typeof advisorUnmatchedSchema>;

export const AdvisorUnmatched: Model<AdvisorUnmatchedDoc> =
  models.AdvisorUnmatched ?? model<AdvisorUnmatchedDoc>("AdvisorUnmatched", advisorUnmatchedSchema);
