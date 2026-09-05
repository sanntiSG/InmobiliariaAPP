import { auth } from "@/auth";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";

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

export async function requireDashboardAccess(): Promise<DashboardAccess | null> {
  const session = await auth().catch(() => null);
  const user = session?.user;
  if (!user?.id) return null;

  if (user.role === "agency_owner" || user.role === "agency_agent") {
    if (!user.agencyId) {
      return { userId: user.id, role: user.role, isAdmin: false, agencyId: null, needsOnboarding: true };
    }

    await connectDB();
    const agency = await Agency.findById(user.agencyId).select("status").lean();
    // Inmobiliaria borrada o suspendida: sin acceso al dashboard.
    if (!agency || agency.status === "suspended") return null;

    return {
      userId: user.id,
      role: user.role,
      isAdmin: false,
      agencyId: user.agencyId,
      needsOnboarding: false,
    };
  }

  if (user.role === "admin") {
    return { userId: user.id, role: "admin", isAdmin: true, agencyId: null, needsOnboarding: false };
  }

  return null;
}
