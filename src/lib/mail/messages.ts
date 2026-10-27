/**
 * Lo que se muestra de los mails guardados: la lista (sin el texto completo) y el detalle de uno. Siempre filtrado por la
 * inmobiliaria: un mail de otra jamás se puede pedir por su id.
 */
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { MailMessage } from "@/lib/db/models/MailMessage";
import { Property } from "@/lib/db/models/Property";
import type { MailCategory, MailMessageStatus } from "./constants";
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
};

const iso = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString() : null);
const snippetOf = (text: string): string => text.replace(/\s+/g, " ").trim().slice(0, 140);

/** Lo que filtra cada pestaña. "Dudas" mira el seguimiento pendiente, sin importar en qué estado esté el mail. */
export const tabFilter = (agencyId: string, tab: MailTab): Record<string, unknown> =>
  tab === "human" ? { agencyId, humanState: "pending", status: { $in: TAB_STATUSES.human } } : { agencyId, status: { $in: TAB_STATUSES[tab] } };

export async function listMessages(agencyId: string, tab: MailTab, limit = 40): Promise<MailListItem[]> {
  await connectDB();
  const docs = await MailMessage.find(tabFilter(agencyId, tab))
    .select("from subject text category status needsHuman auto receivedAt reasons humanState humanTopics")
    .sort({ receivedAt: -1 })
    .limit(limit)
    .lean();
  return docs.map((d) => ({
    id: String(d._id),
    from: { name: d.from?.name ?? "", email: d.from?.email ?? "" },
    subject: d.subject ?? "",
    snippet: snippetOf(d.text ?? ""),
    category: d.category as MailCategory,
    status: d.status as MailMessageStatus,
    needsHuman: !!d.needsHuman,
    auto: !!d.auto,
    receivedAt: iso(d.receivedAt) ?? new Date().toISOString(),
    reason: tab === "ignored" ? ((d.reasons ?? []).slice(-1)[0] ?? null) : null,
    humanState: (d.humanState as HumanState | undefined) ?? "none",
    humanTopics: d.humanTopics ?? [],
  }));
}

export async function messageDetail(agencyId: string, id: string): Promise<MailDetail | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  await connectDB();
  const d = await MailMessage.findOne({ _id: id, agencyId }).lean();
  if (!d) return null;
  const [props, settings, agency] = await Promise.all([
    (d.propertyIds ?? []).length > 0 ? Property.find({ _id: { $in: d.propertyIds }, agencyId }).select("title slug").lean() : Promise.resolve([]),
    loadSettings(agencyId),
    Agency.findById(agencyId).select("name").lean(),
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
