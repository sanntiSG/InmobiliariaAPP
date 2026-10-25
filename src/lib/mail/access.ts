/**
 * Quién puede hacer qué con el correo de una inmobiliaria:
 *  - VER y atender los mails (confirmar, descartar, "revisar ahora"): el dueño y los agentes de esa inmobiliaria.
 *  - CONECTAR, desconectar y CONFIGURAR el buzón: sólo el dueño (y el admin).
 *  - El admin ve el ESTADO de todos los buzones, pero el CONTENIDO de los mails sólo "viendo como" una inmobiliaria (con
 *    `?agencyId=` explícito), y cada vez queda anotado en la bitácora de esa inmobiliaria.
 */
import { NextResponse, type NextRequest } from "next/server";
import { agencyScope } from "@/lib/auth/agency-scope";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";

export type MailAccess = { agencyId: string; userId: string; isAdmin: boolean; role: string; canManage: boolean };

export async function mailAccess(req: NextRequest, opts: { manage?: boolean } = {}): Promise<MailAccess | NextResponse> {
  const access = await requireDashboardAccess();
  if (!access) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (access.needsOnboarding) return NextResponse.json({ error: "Primero creá tu inmobiliaria." }, { status: 403 });
  const scope = agencyScope(access, req.nextUrl.searchParams.get("agencyId"));
  if (!scope) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  if (!scope.agencyId) return NextResponse.json({ error: "Elegí una inmobiliaria." }, { status: 400 });
  const canManage = access.isAdmin || access.role === "agency_owner";
  if (opts.manage && !canManage) {
    return NextResponse.json({ error: "Sólo quien administra la inmobiliaria puede cambiar esto." }, { status: 403 });
  }
  return { agencyId: scope.agencyId, userId: access.userId, isAdmin: access.isAdmin, role: access.role, canManage };
}

/** ¿El despliegue puede enviar mails? (Render gratis bloquea SMTP: sólo se habilita donde sí se puede.) */
export const sendEnabled = (): boolean => process.env.MAIL_SEND_ENABLED === "true";
/** ¿Este despliegue corre la revisión programada? */
export const pollerEnabled = (): boolean => process.env.MAIL_POLLER_ENABLED === "true";
