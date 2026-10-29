/**
 * Lo que se muestra de los mails guardados: la lista (sin el texto completo) y el detalle de uno. Siempre filtrado por la
 * inmobiliaria: un mail de otra jamás se puede pedir por su id.
 */
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { MailMessage } from "@/lib/db/models/MailMessage";
import { Property } from "@/lib/db/models/Property";
import type { HoldCode, MailCategory, MailMessageStatus } from "./constants";
import { askCounts, type StoredAsk } from "./asks-store";
import { followUpStarter } from "./followup";
import { loadSettings } from "./settings";

export type MailTab = "confirm" | "human" | "sent" | "ignored";

export const TAB_STATUSES: Record<MailTab, MailMessageStatus[]> = {
  confirm: ["awaiting_confirmation"],
  // "Dudas": lo que todavía necesita a una persona, esté como esté el mail (para confirmar o ya respondido con lo que se sabía).
  human: ["awaiting_confirmation", "queued", "sending", "sent", "failed"],
  sent: ["queued", "sending", "sent", "failed"],
  ignored: ["ignored", "discarded"],
};

export { SUBS_BY_GROUP, type MailGroup, type MailSub } from "./groups";
import type { MailGroup, MailSub } from "./groups";

/** Las pestañas de antes, expresadas en grupos (por si algo todavía las pide). */
export const tabToGroup = (tab: MailTab): { group: MailGroup; sub: MailSub } =>
  tab === "confirm" ? { group: "attention", sub: "confirm" } : tab === "human" ? { group: "attention", sub: "doubts" } : tab === "sent" ? { group: "answered", sub: "all" } : { group: "ignored", sub: "all" };

export type HumanState = "none" | "pending" | "resolved";

export type MailListItem = {
  id: string;
  from: { name: string; email: string };
  subject: string;
  snippet: string;
  category: MailCategory;
  status: MailMessageStatus;
  needsHuman: boolean;
  auto: boolean;
  receivedAt: string;
  /** Por qué se ignoró (sólo en lo ignorado). */
  reason: string | null;
  /** `pending`: queda algo que tiene que contestar una persona (hay una notificación y sigue en la pestaña "Dudas"). */
  humanState: HumanState;
  humanTopics: string[];
  /** El agente no estaba seguro de qué necesitaba. */
  uncertain: boolean;
  /** Por qué no salió sola (si no salió sola). */
  holdCode: HoldCode | null;
  /** Cuántos mails de esta misma conversación hay en la lista (1 = sólo éste). */
  threadCount: number;
  /** Cuántas de sus preguntas se contestaron, cuántas faltan en la publicación y cuántas quedan para una persona. */
  asks: { answered: number; missing: number; human: number };
};

export type MailFollowUp = { id: string; body: string; at: string; status: "queued" | "sending" | "sent" | "failed"; error: string | null };

export type MailDetail = MailListItem & {
  text: string;
  reasons: string[];
  confidence: number;
  authFailed: boolean;
  replyTo: string | null;
  draft: { subject: string; body: string } | null;
  edited: boolean;
  error: string | null;
  sentAt: string | null;
  properties: { id: string; title: string; slug: string }[];
  /** Contestó un mail automático nuestro: posiblemente quiere hablar con una persona. */
  repliedToAuto: boolean;
  /** Preguntas que la publicación no podía contestar. */
  missingData: number;
  /** Lo que el equipo contestó después de la primera respuesta. */
  followUps: MailFollowUp[];
  /** El texto con el que arranca el cuadro para contestar la duda (saludo, tema, cierre y firma). */
  followUpStarter: string;
  /** Cada pregunta del mail y qué pasó con ella. */
  askList: StoredAsk[];
  topics: string[];
  /** El tema que una persona corrigió a mano (si lo hizo). */
  correctedTopic: string | null;
  /** Los otros mails de esta misma conversación (más nuevos primero). */
  thread: { id: string; subject: string; receivedAt: string; status: MailMessageStatus; auto: boolean }[];
};

const iso = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString() : null);
const snippetOf = (text: string): string => text.replace(/\s+/g, " ").trim().slice(0, 140);

/** Lo que filtra cada grupo (y su afinado). La "atención" suma lo que espera confirmación, las dudas pendientes y los envíos fallidos. */
export function groupFilter(agencyId: string, group: MailGroup, sub: MailSub = "all"): Record<string, unknown> {
  if (group === "ignored") return { agencyId, status: { $in: TAB_STATUSES.ignored } };
  if (group === "answered") return { agencyId, status: { $in: ["queued", "sending", "sent"] }, ...(sub === "auto" ? { auto: true } : sub === "person" ? { auto: false } : {}) };
  const confirm = { status: "awaiting_confirmation" };
  const doubts = { humanState: "pending", status: { $in: TAB_STATUSES.human } };
  const errors = { status: "failed" };
  if (sub === "confirm") return { agencyId, ...confirm };
  if (sub === "doubts") return { agencyId, ...doubts };
  if (sub === "unsure") return { agencyId, ...confirm, uncertain: true };
  if (sub === "errors") return { agencyId, ...errors };
  return { agencyId, $or: [confirm, doubts, errors] };
}

/** Un texto de búsqueda como expresión segura (sin que quien escribe pueda armar una regla propia). */
const searchOf = (q: string): Record<string, unknown> | null => {
  const text = q.replace(/\s+/g, " ").trim().slice(0, 60);
  if (text.length < 2) return null;
  const rx = { $regex: text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  return { $or: [{ subject: rx }, { "from.email": rx }, { "from.name": rx }, { text: rx }] };
};

/** Lo que filtra cada pestaña. "Dudas" mira el seguimiento pendiente, sin importar en qué estado esté el mail. */
export const tabFilter = (agencyId: string, tab: MailTab): Record<string, unknown> =>
  tab === "human" ? { agencyId, humanState: "pending", status: { $in: TAB_STATUSES.human } } : { agencyId, status: { $in: TAB_STATUSES[tab] } };

type ListDoc = {
  _id: unknown;
  from?: { name?: string | null; email?: string | null } | null;
  subject?: string | null;
  text?: string | null;
  category?: string | null;
  status?: string | null;
  needsHuman?: boolean | null;
  auto?: boolean | null;
  receivedAt?: Date | null;
  reasons?: string[] | null;
  humanState?: string | null;
  humanTopics?: string[] | null;
  uncertain?: boolean | null;
  holdCode?: string | null;
  threadKey?: string | null;
  asks?: { state: string }[] | null;
};

const LIST_FIELDS = "from subject text category status needsHuman auto receivedAt reasons humanState humanTopics uncertain holdCode threadKey asks";

function toItem(d: ListDoc, ignoredView: boolean, threadCount = 1): MailListItem {
  return {
    id: String(d._id),
    from: { name: d.from?.name ?? "", email: d.from?.email ?? "" },
    subject: d.subject ?? "",
    snippet: snippetOf(d.text ?? ""),
    category: d.category as MailCategory,
    status: d.status as MailMessageStatus,
    needsHuman: !!d.needsHuman,
    auto: !!d.auto,
    receivedAt: iso(d.receivedAt) ?? new Date().toISOString(),
    reason: ignoredView ? ((d.reasons ?? []).slice(-1)[0] ?? null) : null,
    humanState: (d.humanState as HumanState | undefined) ?? "none",
    humanTopics: d.humanTopics ?? [],
    uncertain: !!d.uncertain,
    holdCode: (d.holdCode as HoldCode | null | undefined) ?? null,
    threadCount,
    asks: askCounts(d.asks ?? []),
  };
}

/**
 * La bandeja de un grupo: opcionalmente filtrada por una búsqueda (asunto, remitente o texto, sólo de ESTA inmobiliaria) y con los
 * mails de una misma conversación juntos (se muestra el último y cuántos son). Devuelve los más recientes primero.
 */
export async function listInbox(agencyId: string, opts: { group: MailGroup; sub?: MailSub; q?: string; limit?: number }): Promise<MailListItem[]> {
  await connectDB();
  const filter = groupFilter(agencyId, opts.group, opts.sub ?? "all");
  const search = opts.q ? searchOf(opts.q) : null;
  const docs = await MailMessage.find(search ? { $and: [filter, search] } : filter)
    .select(LIST_FIELDS)
    .sort({ receivedAt: -1 })
    .limit(120)
    .lean();
  const threads = new Map<string, { first: ListDoc; n: number }>();
  for (const d of docs as ListDoc[]) {
    const key = d.threadKey ?? `id:${String(d._id)}`;
    const t = threads.get(key);
    if (t) t.n++;
    else threads.set(key, { first: d, n: 1 });
  }
  return [...threads.values()].slice(0, opts.limit ?? 40).map((t) => toItem(t.first, opts.group === "ignored", t.n));
}

export async function listMessages(agencyId: string, tab: MailTab, limit = 40): Promise<MailListItem[]> {
  await connectDB();
  const docs = await MailMessage.find(tabFilter(agencyId, tab))
    .select(LIST_FIELDS)
    .sort({ receivedAt: -1 })
    .limit(limit)
    .lean();
  return (docs as ListDoc[]).map((d) => toItem(d, tab === "ignored"));
}

export async function messageDetail(agencyId: string, id: string): Promise<MailDetail | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  await connectDB();
  const d = await MailMessage.findOne({ _id: id, agencyId }).lean();
  if (!d) return null;
  const [props, settings, agency, siblings] = await Promise.all([
    (d.propertyIds ?? []).length > 0 ? Property.find({ _id: { $in: d.propertyIds }, agencyId }).select("title slug").lean() : Promise.resolve([]),
    loadSettings(agencyId),
    Agency.findById(agencyId).select("name").lean(),
    // Los otros mails de la misma conversación (sólo de esta inmobiliaria).
    d.threadKey ? MailMessage.find({ agencyId, threadKey: d.threadKey, _id: { $ne: d._id } }).sort({ receivedAt: -1 }).limit(10).select("subject receivedAt status auto").lean() : Promise.resolve([]),
  ]);
  return {
    id: String(d._id),
    from: { name: d.from?.name ?? "", email: d.from?.email ?? "" },
    subject: d.subject ?? "",
    snippet: snippetOf(d.text ?? ""),
    category: d.category as MailCategory,
    status: d.status as MailMessageStatus,
    needsHuman: !!d.needsHuman,
    auto: !!d.auto,
    receivedAt: iso(d.receivedAt) ?? new Date().toISOString(),
    reason: d.status === "ignored" ? ((d.reasons ?? []).slice(-1)[0] ?? null) : null,
    humanState: (d.humanState as HumanState | undefined) ?? "none",
    humanTopics: d.humanTopics ?? [],
    uncertain: !!d.uncertain,
    holdCode: (d.holdCode as HoldCode | null | undefined) ?? null,
    threadCount: 1 + siblings.length,
    asks: askCounts(d.asks ?? []),
    askList: (d.asks ?? []).map((a) => ({ key: a.key, label: a.label ?? "", state: a.state as StoredAsk["state"], ...(a.propertyId ? { propertyId: String(a.propertyId) } : {}) })),
    topics: d.topics ?? [],
    correctedTopic: d.correctedTopic ?? null,
    thread: siblings.map((m) => ({ id: String(m._id), subject: m.subject ?? "", receivedAt: iso(m.receivedAt) ?? new Date().toISOString(), status: m.status as MailMessageStatus, auto: !!m.auto })),
    repliedToAuto: !!d.repliedToAuto,
    missingData: d.missingData ?? 0,
    followUps: (d.followUps ?? []).map((f) => ({ id: String(f._id), body: f.body, at: iso(f.at) ?? new Date().toISOString(), status: f.status as MailFollowUp["status"], error: f.error ?? null })),
    followUpStarter: followUpStarter({ fromName: d.from?.name ?? null, topics: d.humanTopics ?? [], settings, agencyName: agency?.name ?? "la inmobiliaria" }),
    text: d.text ?? "",
    reasons: d.reasons ?? [],
    confidence: d.confidence ?? 0,
    authFailed: !!d.authFailed,
    replyTo: d.replyTo ?? null,
    draft: d.draft?.body ? { subject: d.draft.subject ?? "", body: d.draft.body } : null,
    edited: !!d.edited,
    error: d.error ?? null,
    sentAt: iso(d.sentAt),
    properties: props.map((p) => ({ id: String(p._id), title: p.title, slug: p.slug })),
  };
}
