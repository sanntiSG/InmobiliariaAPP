import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { ActivityLog, type ActivityKind } from "@/lib/db/models/ActivityLog";
import { USER_ROLES } from "@/lib/db/models/User";
import { invalidateAgency } from "@/lib/intelligence/cache";
import { sanitizeChange, type ActivityChange } from "./diff";

/** Tope de cambios por entrada: una edición normal toca pocos campos. */
const MAX_CHANGES = 40;

export type ActivityInput = {
  agencyId: string;
  propertyId?: string | null;
  propertyTitle?: string;
  actorId?: string | null;
  actorRole?: string;
  kind: ActivityKind;
  changes?: ActivityChange[];
};

/**
 * Registra una acción en la bitácora. NUNCA lanza: la bitácora es un apoyo
 * del asesor, no puede romper el guardado de una propiedad. Pensado para
 * llamarse dentro de `after()` (después de responder).
 */
export async function logActivity(input: ActivityInput): Promise<void> {
  try {
    if (!Types.ObjectId.isValid(input.agencyId)) return;
    const changes = (input.changes ?? []).slice(0, MAX_CHANGES).map(sanitizeChange);
    // Una edición que no cambió nada no deja huella.
    if (input.kind.endsWith("_updated") && changes.length === 0) return;

    await connectDB();
    await ActivityLog.create({
      agencyId: input.agencyId,
      propertyId: input.propertyId && Types.ObjectId.isValid(input.propertyId) ? input.propertyId : null,
      propertyTitle: input.propertyTitle?.slice(0, 160),
      actorId: input.actorId && Types.ObjectId.isValid(input.actorId) ? input.actorId : null,
      // Un rol desconocido se descarta en vez de romper la validación del enum.
      actorRole: USER_ROLES.find((role) => role === input.actorRole),
      kind: input.kind,
      changes,
      fields: [...new Set(changes.map((c) => c.field))],
    });
  } catch (err) {
    console.error("logActivity failed:", err);
  }
}

/**
 * Se llama SÍNCRONAMENTE justo después de cada mutación (no dentro de
 * `after()`): descarta lo cacheado de esa inmobiliaria para que el panel y
 * el asesor vean el cambio en la próxima lectura y no 60 s después.
 */
export function touchAgencyData(agencyId: string | null | undefined): void {
  if (agencyId) invalidateAgency(String(agencyId));
}
