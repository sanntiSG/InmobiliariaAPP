import { NextResponse, type NextRequest } from "next/server";
import { agencyScope } from "@/lib/auth/agency-scope";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";

/**
 * Acceso común a las rutas de contenido para redes: dueño/agente siempre sobre su
 * inmobiliaria; el admin elige una con `?agencyId=` (acá no existe "todas").
 */
export async function socialAccess(
  req: NextRequest
): Promise<{ agencyId: string; isAdmin: boolean; userId: string } | NextResponse> {
  const access = await requireDashboardAccess();
  if (!access) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const scope = agencyScope(access, req.nextUrl.searchParams.get("agencyId"));
  if (!scope) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  if (!scope.agencyId) return NextResponse.json({ error: "Elegí una inmobiliaria." }, { status: 400 });
  return { agencyId: scope.agencyId, isAdmin: access.isAdmin, userId: access.userId };
}
