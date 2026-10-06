import { isLeadStale, type LeadStatus } from "./status";

export type LeadRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  property: { id: string; title: string; slug: string } | null;
  status: LeadStatus;
  visitRequested: boolean;
  visitDone: boolean;
  offerMade: boolean;
  lastContactAt: string | null;
  createdAt: string;
  stale: boolean;
  messages: { text: string; at: string }[];
  notes: { text: string; at: string }[];
};

type PopulatedProperty = { _id: unknown; title?: string; slug?: string } | null | undefined;

type LeanLead = {
  _id: unknown;
  name: string;
  email?: string | null;
  phone?: string | null;
  propertyId?: unknown;
  status: string;
  visitRequested?: boolean;
  visitDone?: boolean;
  offerMade?: boolean;
  lastContactAt?: Date | null;
  createdAt: Date;
  messages?: { text: string; at: Date }[];
  notes?: { text: string; at: Date }[];
};

/** Lead (con `propertyId` populado) → forma plana y serializable para el cliente. */
export function toLeadRow(lead: LeanLead): LeadRow {
  const property = lead.propertyId as PopulatedProperty;
  return {
    id: String(lead._id),
    name: lead.name,
    email: lead.email ?? null,
    phone: lead.phone ?? null,
    property: property?.title
      ? { id: String(property._id), title: property.title, slug: property.slug ?? "" }
      : null,
    status: lead.status as LeadStatus,
    visitRequested: !!lead.visitRequested,
    visitDone: !!lead.visitDone,
    offerMade: !!lead.offerMade,
    lastContactAt: lead.lastContactAt ? lead.lastContactAt.toISOString() : null,
    createdAt: lead.createdAt.toISOString(),
    stale: isLeadStale(lead),
    messages: (lead.messages ?? []).map((m) => ({ text: m.text, at: m.at.toISOString() })),
    notes: (lead.notes ?? []).map((n) => ({ text: n.text, at: n.at.toISOString() })),
  };
}
