import { auth } from "@/auth";
import { Agency } from "@/lib/db/models/Agency";
import { getFreshAccount, isAgencyRole } from "./fresh-account";

/**
 * Acceso al dashboard de propiedades: dueños/agentes de una inmobiliaria
 * (atados a `agencyId`), o el admin de la plataforma (sin agencia fija —
 * ve y gestiona propiedades de todas, elige la inmobiliaria al crear).
 *
 * `agencyId: null` significa "admin, sin scope a una sola inmobiliaria" —
 * nunca "sin acceso" (eso ya es `null` a nivel de toda la función).
 */
export type DashboardAccess = {
  userId: string;
  role: string;
  isAdmin: boolean;
  agencyId: string | null;
  /** true cuando el usuario tiene rol de agencia pero todavía no tiene una inmobiliaria (ver /publicar). */
  needsOnboarding: boolean;
};

/**
 * El rol y la agencia se leen de la base (`getFreshAccount`), no del JWT: el
 * token puede estar desactualizado y bloqueaba a quien acababa de recibir el
 * permiso o de crear su inmobiliaria, o dejaba entrar a quien acababa de
 * perderlo. La sesión sólo se usa para saber QUIÉN es.
 */
export async function requireDashboardAccess(): Promise<DashboardAccess | null> {
  const session = await auth().catch(() => null);
  const userId = session?.user?.id;
  if (!userId) return null;

  const account = await getFreshAccount(userId);
  if (!account) return null;

  if (isAgencyRole(account.role)) {
    if (!account.agencyId) {
      return { userId, role: account.role, isAdmin: false, agencyId: null, needsOnboarding: true };
    }

    const agency = await Agency.findById(account.agencyId).select("status").lean();
    // Inmobiliaria borrada o suspendida: sin acceso al dashboard.
    if (!agency || agency.status === "suspended") return null;

    return { userId, role: account.role, isAdmin: false, agencyId: account.agencyId, needsOnboarding: false };
  }

  if (account.role === "admin") {
    return { userId, role: "admin", isAdmin: true, agencyId: null, needsOnboarding: false };
  }

  return null;
}
