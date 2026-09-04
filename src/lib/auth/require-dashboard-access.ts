import { auth } from "@/auth";

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
};

export async function requireDashboardAccess(): Promise<DashboardAccess | null> {
  const session = await auth().catch(() => null);
  const user = session?.user;
  if (!user?.id) return null;

  if (user.role === "agency_owner" || user.role === "agency_agent") {
    if (!user.agencyId) return null;
    return { userId: user.id, role: user.role, isAdmin: false, agencyId: user.agencyId };
  }

  if (user.role === "admin") {
    return { userId: user.id, role: "admin", isAdmin: true, agencyId: null };
  }

  return null;
}
