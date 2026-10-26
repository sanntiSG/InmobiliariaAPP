import { Schema, models, model, type InferSchemaType, type Model } from "mongoose";

/** Qué agente aprende de la lección. El de marketing no interpreta texto libre: no tiene lecciones. */
export const LESSON_AGENTS = ["advisor", "mail"] as const;
export type LessonAgent = (typeof LESSON_AGENTS)[number];

/** De dónde salió la lección. */
export const LESSON_SOURCES = ["unmatched", "manual", "mail_rescue", "mail_dismiss"] as const;
export type LessonSource = (typeof LESSON_SOURCES)[number];

/**
 * Una lección: "una frase como ésta quiere decir esto". Es el único camino por el que un agente aprende sin tocar el código, y
 * sólo SUMA ejemplos: el asesor los compara con lo que le preguntan (misma similitud que ya usa con sus frases de ejemplo) y el
 * correo los usa para no descartar a ciegas una consulta que se parece a otra que una persona ya marcó. Nada de esto reemplaza
 * las reglas ni puede hacer que un mail salga solo: sólo ayuda en los casos dudosos.
 *
 * Privacidad: el texto se guarda ENMASCARADO (sin emails, links, teléfonos ni usuarios) y acotado. Las lecciones del admin son
 * globales (`agencyId` vacío); las que nacen de "Era una consulta" / "No es una consulta" pertenecen a esa inmobiliaria y nunca
 * se usan para otra.
 */
const agentLessonSchema = new Schema(
  {
    agent: { type: String, enum: LESSON_AGENTS, required: true },
    /** Asesor: id de la intención ("agency.worst"). Correo: "inquiry" (es una consulta) o "not_inquiry" (no lo es). */
    target: { type: String, required: true, maxlength: 60 },
    /** Frase enmascarada tal como se muestra. */
    text: { type: String, required: true, maxlength: 400 },
    /** Hash del texto normalizado + objetivo + ámbito: una misma lección no se guarda dos veces. */
    key: { type: String, required: true, unique: true },
    agencyId: { type: Schema.Types.ObjectId, ref: "Agency", default: null },
    source: { type: String, enum: LESSON_SOURCES, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    /** Las lecciones de una inmobiliaria vencen solas; las del admin no. */
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

agentLessonSchema.index({ agent: 1, target: 1 });
agentLessonSchema.index({ agent: 1, agencyId: 1, createdAt: -1 });
// Sin `expiresAt` (las del admin) el documento no vence.
agentLessonSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AgentLessonDoc = InferSchemaType<typeof agentLessonSchema>;

export const AgentLesson: Model<AgentLessonDoc> = models.AgentLesson ?? model<AgentLessonDoc>("AgentLesson", agentLessonSchema);
