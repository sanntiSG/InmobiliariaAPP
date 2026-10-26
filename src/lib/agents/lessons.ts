/**
 * Lecciones de los agentes (servidor): guardar, listar, borrar y cargar para usar. Ver el modelo `AgentLesson` para qué son y
 * por qué sólo suman. El texto se enmascara antes de guardarse; cada ámbito tiene un tope y, si se pasa, se descartan las más
 * viejas (nunca crece sin límite); lo que se carga para usar va en una caché corta que se descarta al escribir.
 */
import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { AgentLesson, type LessonAgent, type LessonSource } from "@/lib/db/models/AgentLesson";
import { memo, invalidate } from "@/lib/intelligence/cache";
import { maskPersonalData } from "@/lib/agents/knowledge/mask";
import { normalizeText } from "@/lib/advisor/nlu/normalize";
import { INTENT_BY_ID } from "@/lib/advisor/nlu/intents";
import { stemSet } from "@/lib/agents/knowledge/similarity";
import type { TaughtExamples } from "@/lib/advisor/nlu/classify";

const CACHE_PREFIX = "lessons:";
const CACHE_MS = 60_000;
const DAY_MS = 86_400_000;
/** Largo máximo de una lección: una pregunta es corta; un mail se resume en su asunto y el comienzo. */
export const LESSON_MAX_CHARS: Record<LessonAgent, number> = { advisor: 160, mail: 320 };
/** Cuántas lecciones se guardan por ámbito (al pasarse, se descartan las más viejas). */
export const LESSON_CAPS = { advisor: 400, mailGlobal: 200, mailAgency: 100 } as const;
/**
 * Cuánto duran las lecciones que nacen de marcar un mail (las del admin no vencen): lo mismo que se guarda el mail mismo. Y de un
 * mail NO se guarda su texto sino sólo las raíces de sus palabras, sin orden: sirve para reconocer uno parecido, no para leerlo.
 */
const MAIL_LESSON_DAYS = 60;
/** Una lección con menos palabras que esto no enseña nada. */
const MIN_TOKENS = 2;

export const MAIL_LESSON_TARGETS = ["inquiry", "not_inquiry"] as const;
export type MailLessonTarget = (typeof MAIL_LESSON_TARGETS)[number];

export type LessonRow = { id: string; agent: LessonAgent; target: string; text: string; source: LessonSource; agencyScoped: boolean; createdAt: string };

export type SaveLessonInput = {
  agent: LessonAgent;
  target: string;
  text: string;
  source: LessonSource;
  /** Sólo para el correo: la lección vale únicamente para esa inmobiliaria. */
  agencyId?: string | null;
  userId?: string | null;
};

export type SaveLessonResult = { ok: true; id: string; created: boolean } | { ok: false; reason: "bad_target" | "too_short" | "too_many" };

/** ¿Es un objetivo válido para ese agente? (una intención que existe, o inquiry/not_inquiry). */
export function isValidTarget(agent: LessonAgent, target: string): boolean {
  if (agent === "advisor") return INTENT_BY_ID.has(target as never) && !target.startsWith("common.");
  return (MAIL_LESSON_TARGETS as readonly string[]).includes(target);
}

export const invalidateLessons = () => invalidate(CACHE_PREFIX);

export async function saveLesson(input: SaveLessonInput): Promise<SaveLessonResult> {
  if (!isValidTarget(input.agent, input.target)) return { ok: false, reason: "bad_target" };
  const masked = maskPersonalData(input.text, LESSON_MAX_CHARS[input.agent]);
  const norm = normalizeText(masked);
  if (norm.split(" ").filter(Boolean).length < MIN_TOKENS || norm.length < 6) return { ok: false, reason: "too_short" };
  // Lo de un mail nunca se guarda legible: sólo sus raíces de palabra (ver `MAIL_LESSON_DAYS`).
  const text = input.source === "mail_rescue" || input.source === "mail_dismiss" ? [...stemSet(masked)].join(" ").slice(0, 400) : masked;
  const agency = input.agent === "mail" && input.agencyId && Types.ObjectId.isValid(input.agencyId) ? new Types.ObjectId(input.agencyId) : null;
  const key = createHash("sha1").update(`${input.agent}:${input.target}:${agency ?? "-"}:${norm}`).digest("hex");

  await connectDB();
  const expiresAt = agency ? new Date(Date.now() + MAIL_LESSON_DAYS * DAY_MS) : undefined;
  const res = await AgentLesson.updateOne(
    { key },
    {
      $setOnInsert: { agent: input.agent, target: input.target, text, agencyId: agency, source: input.source, createdBy: input.userId && Types.ObjectId.isValid(input.userId) ? new Types.ObjectId(input.userId) : null },
      // Volver a enseñar lo mismo la renueva (sólo vence la de una inmobiliaria).
      ...(expiresAt ? { $set: { expiresAt } } : {}),
    },
    { upsert: true }
  );
  const doc = await AgentLesson.findOne({ key }).select("_id").lean();
  if (!doc) return { ok: false, reason: "too_many" };
  await trimToCap(input.agent, agency);
  invalidateLessons();
  return { ok: true, id: String(doc._id), created: res.upsertedCount > 0 };
}

/** Descarta las más viejas si el ámbito se pasó de su tope. */
async function trimToCap(agent: LessonAgent, agencyId: Types.ObjectId | null): Promise<void> {
  const cap = agent === "advisor" ? LESSON_CAPS.advisor : agencyId ? LESSON_CAPS.mailAgency : LESSON_CAPS.mailGlobal;
  const scope = { agent, agencyId: agent === "mail" ? agencyId : null };
  const total = await AgentLesson.countDocuments(scope);
  if (total <= cap) return;
  const extra = await AgentLesson.find(scope).sort({ createdAt: 1 }).limit(total - cap).select("_id").lean();
  await AgentLesson.deleteMany({ _id: { $in: extra.map((e) => e._id) } });
}

const toRow = (d: { _id: unknown; agent: LessonAgent; target: string; text: string; source: LessonSource; agencyId?: unknown; createdAt?: Date }): LessonRow => ({
  id: String(d._id),
  agent: d.agent,
  target: d.target,
  text: d.text,
  source: d.source,
  agencyScoped: !!d.agencyId,
  createdAt: new Date(d.createdAt ?? Date.now()).toISOString(),
});

/** Lo que el admin ve: las lecciones globales de un agente (las de una inmobiliaria no se muestran: son de ella). */
export async function listLessons(agent: LessonAgent, limit = 200): Promise<LessonRow[]> {
  await connectDB();
  const docs = await AgentLesson.find({ agent, agencyId: null }).sort({ createdAt: -1 }).limit(limit).lean();
  return docs.map(toRow);
}

/** Borra una lección global (las de una inmobiliaria las maneja ella al marcar mails; el admin no las toca). */
export async function deleteLesson(id: string): Promise<boolean> {
  if (!Types.ObjectId.isValid(id)) return false;
  await connectDB();
  const res = await AgentLesson.deleteOne({ _id: id, agencyId: null });
  if (res.deletedCount > 0) invalidateLessons();
  return res.deletedCount > 0;
}

// ─── Para usar ───────────────────────────────────────────────────────────────

/** Lo enseñado al asesor, listo para `understand`: `intención → frases (como conjuntos de raíces)`. */
export async function loadAdvisorLessons(): Promise<TaughtExamples> {
  return memo(`${CACHE_PREFIX}advisor`, CACHE_MS, async () => {
    try {
      await connectDB();
      const docs = await AgentLesson.find({ agent: "advisor", agencyId: null }).select("target text").limit(LESSON_CAPS.advisor).lean();
      const byIntent = new Map<string, Set<string>[]>();
      for (const d of docs) {
        const list = byIntent.get(d.target) ?? [];
        list.push(stemSet(d.text));
        byIntent.set(d.target, list);
      }
      return byIntent as TaughtExamples;
    } catch (err) {
      // Si no se pueden leer, el asesor sigue funcionando con sus frases de siempre.
      console.error("loadAdvisorLessons failed:", (err as Error)?.message);
      return new Map() as TaughtExamples;
    }
  });
}

export type MailLessonSets = { inquiry: Set<string>[]; notInquiry: Set<string>[] };

/** Lo enseñado al correo para esa inmobiliaria: lo global del admin más lo que sus propias personas marcaron. */
export async function loadMailLessons(agencyId: string): Promise<MailLessonSets> {
  return memo(`${CACHE_PREFIX}mail:${agencyId}`, CACHE_MS, async () => {
    const out: MailLessonSets = { inquiry: [], notInquiry: [] };
    try {
      await connectDB();
      const scope = Types.ObjectId.isValid(agencyId) ? [null, new Types.ObjectId(agencyId)] : [null];
      const docs = await AgentLesson.find({ agent: "mail", agencyId: { $in: scope } }).select("target text source").limit(LESSON_CAPS.mailGlobal + LESSON_CAPS.mailAgency).lean();
      for (const d of docs) {
        // Las de un mail ya están guardadas como raíces; las que escribió el admin se convierten a raíces acá.
        const sets = d.source === "mail_rescue" || d.source === "mail_dismiss" ? new Set(d.text.split(" ").filter(Boolean)) : stemSet(d.text);
        (d.target === "inquiry" ? out.inquiry : out.notInquiry).push(sets);
      }
    } catch (err) {
      console.error("loadMailLessons failed:", (err as Error)?.message);
    }
    return out;
  });
}
