/**
 * Quién puede usar el asesor y sobre qué datos. TODO se decide en el servidor:
 *  - Modo inmobiliaria: sólo quien gestiona una inmobiliaria (o el admin), y el
 *    alcance sale de la base (`requireDashboardAccess` + `agencyScope`), nunca del cliente.
 *  - Modo explorador: cualquiera; con sesión se personaliza, sin sesión rige el cupo gratuito.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { agencyScope } from "@/lib/auth/agency-scope";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import type { AdvisorMode } from "./types";

export type AdvisorAccess = {
  mode: AdvisorMode;
  /** Inmobiliaria sobre la que se consulta; `null` = toda la plataforma (sólo admin) o modo explorador. */
  agencyId: string | null;
  isAdmin: boolean;
  userId: string | null;
};

export async function resolveAdvisorAccess(
  mode: AdvisorMode,
  requestedAgencyId?: string
): Promise<{ ok: true; access: AdvisorAccess } | { ok: false; response: NextResponse }> {
  if (mode === "agency") {
    const dash = await requireDashboardAccess();
    if (!dash) return { ok: false, response: NextResponse.json({ error: "Necesitás iniciar sesión con una cuenta de inmobiliaria." }, { status: 401 }) };
    if (dash.needsOnboarding) return { ok: false, response: NextResponse.json({ error: "Primero creá tu inmobiliaria." }, { status: 403 }) };
    const scope = agencyScope(dash, requestedAgencyId);
    if (!scope) return { ok: false, response: NextResponse.json({ error: "No autorizado." }, { status: 403 }) };
    return { ok: true, access: { mode, agencyId: scope.agencyId, isAdmin: dash.isAdmin, userId: dash.userId } };
  }

  const session = await auth().catch(() => null);
  const user = session?.user;
  return { ok: true, access: { mode, agencyId: null, isAdmin: user?.role === "admin", userId: user?.id ?? null } };
}
