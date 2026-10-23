import { NextResponse } from "next/server";
import { requireDashboardAccess, type DashboardAccess } from "@/lib/auth/require-dashboard-access";
import { limitOr429 } from "@/lib/security/rate-limit";

export const AMBIENT_NO_STORE = { "Cache-Control": "no-store" } as const;

export const ambientError = (error: string, status: number, extra?: Record<string, unknown>) =>
  NextResponse.json({ error, ...extra }, { status, headers: AMBIENT_NO_STORE });

/**
 * Entrada común de las rutas de la portada viva: sesión con acceso al panel (dueño, agente o admin), inmobiliaria ya
 * creada y un tope de uso por persona (falla cerrado: son endpoints que escriben en el storage).
 */
export async function ambientGuard(
  req: Request,
  scope: string,
  limit: number
): Promise<{ access: DashboardAccess } | NextResponse> {
  const access = await requireDashboardAccess();
  if (!access) return ambientError("Necesitás iniciar sesión.", 401);
  if (access.needsOnboarding) return ambientError("Primero creá tu inmobiliaria en /publicar.", 403);
  const limited = await limitOr429(req, scope, limit, 60 * 60, { userId: access.userId, failOpen: false });
  if (limited) return limited;
  return { access };
}
