import { Types } from "mongoose";
import type { DashboardAccess } from "./require-dashboard-access";

/**
 * Filtro de inmobiliaria para consultas del dashboard — el punto único que
 * garantiza que una inmobiliaria jamás vea datos de otra.
 *
 * - Dueño/agente: SIEMPRE su propia `agencyId`; cualquier `requested` se ignora.
 * - Admin: la inmobiliaria pedida (si es un id válido), o `null` = todas.
 *
 * Devuelve `null` si el acceso no tiene inmobiliaria ni es admin (no debería
 * pasar tras `requireDashboardAccess`, pero así falla cerrado).
 */
export function agencyScope(
  access: DashboardAccess,
  requested?: string | null
): { agencyId: string | null } | null {
  if (access.isAdmin) {
    const valid = requested && Types.ObjectId.isValid(requested) ? requested : null;
    return { agencyId: valid };
  }
  if (!access.agencyId) return null;
  return { agencyId: access.agencyId };
}

/** Condición de Mongo para el scope: `{ agencyId }` o `{}` (admin viendo todo). */
export function scopeFilter(scope: { agencyId: string | null }): { agencyId?: string } {
  return scope.agencyId ? { agencyId: scope.agencyId } : {};
}
