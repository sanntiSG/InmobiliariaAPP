/**
 * Lo que se muestra de los mails guardados: la lista (sin el texto completo) y el detalle de uno. Siempre filtrado por la
 * inmobiliaria: un mail de otra jamás se puede pedir por su id.
 */
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { MailMessage } from "@/lib/db/models/MailMessage";
import { Property } from "@/lib/db/models/Property";
import type { MailCategory, MailMessageStatus } from "./constants";

export type MailTab = "confirm" | "sent" | "ignored";

export const TAB_STATUSES: Record<MailTab, MailMessageStatus[]> = {
  confirm: ["awaiting_confirmation"],
  sent: ["queued", "sending", "sent", "failed"],
  ignored: ["ignored", "discarded"],
};

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
};

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
};

const iso = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString() : null);
const snippetOf = (text: string): string => text.replace(/\s+/g, " ").trim().slice(0, 140);

export async function listMessages(agencyId: string, tab: MailTab, limit = 40): Promise<MailListItem[]> {
  await connectDB();
  const docs = await MailMessage.find({ agencyId, status: { $in: TAB_STATUSES[tab] } })
    .select("from subject text category status needsHuman auto receivedAt reasons")
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
  }));
}

export async function messageDetail(agencyId: string, id: string): Promise<MailDetail | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  await connectDB();
  const d = await MailMessage.findOne({ _id: id, agencyId }).lean();
  if (!d) return null;
  const props = (d.propertyIds ?? []).length > 0 ? await Property.find({ _id: { $in: d.propertyIds }, agencyId }).select("title slug").lean() : [];
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
