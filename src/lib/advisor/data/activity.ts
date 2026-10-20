import { Types } from "mongoose";
import { ActivityLog, type ActivityKind } from "@/lib/db/models/ActivityLog";
import type { ActivityChange } from "@/lib/activity/diff";

export type ActivityEntry = {
  id: string;
  at: Date;
  kind: ActivityKind;
  propertyId: string | null;
  propertyTitle: string | null;
  actorRole: string | null;
  changes: ActivityChange[];
};

const LOOKBACK_DAYS = 90;
const MAX_ENTRIES = 400;

/**
 * Lo que hizo la inmobiliaria en los últimos 90 días (más nuevo primero). Una
 * sola consulta alimenta toda la conversación: "qué cambié", el impacto de un
 * cambio y las pistas que se adjuntan a cada propiedad de una respuesta.
 */
export async function loadActivity(agencyId: string | null, now = new Date()): Promise<ActivityEntry[]> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
  const rows = await ActivityLog.find({
    ...(agencyId ? { agencyId: new Types.ObjectId(agencyId) } : {}),
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .limit(MAX_ENTRIES)
    .lean();

  return rows.map((r) => ({
    id: String(r._id),
    at: new Date(r.createdAt),
    kind: r.kind,
    propertyId: r.propertyId ? String(r.propertyId) : null,
    propertyTitle: r.propertyTitle ?? null,
    actorRole: r.actorRole ?? null,
    changes: (r.changes ?? []).map((c) => ({
      field: c.field,
      before: c.before as ActivityChange["before"],
      after: c.after as ActivityChange["after"],
      unit: c.unit ?? undefined,
      note: c.note ?? undefined,
    })),
  }));
}

/** Última vez que se tocó un campo de una propiedad (el cambio más reciente que lo incluye). */
export function lastChangeOf(
  activity: ActivityEntry[],
  propertyId: string,
  fields: string[]
): { at: Date; change: ActivityChange } | null {
  for (const entry of activity) {
    if (entry.propertyId !== propertyId) continue;
    const change = entry.changes.find((c) => fields.includes(c.field));
    if (change) return { at: entry.at, change };
  }
  return null;
}
