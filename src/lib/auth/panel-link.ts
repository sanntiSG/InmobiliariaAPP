// Sólo tipos del módulo de servidor: este archivo lo importan componentes de
// cliente (UserMenu) y no puede arrastrar mongoose al bundle.
import type { FreshAccount } from "./fresh-account";

const isAgencyRole = (role: string | undefined) => role === "agency_owner" || role === "agency_agent";

export type PanelLinkKind = "dashboard" | "onboarding" | "admin" | "espacio";
export type PanelLink = { href: string; label: string; kind: PanelLinkKind };

/**
 * A qué "panel" va cada persona (mismo criterio en el hero, el mapa y el menú):
 * - inmobiliaria con agencia → su dashboard; sin agencia todavía → crearla;
 * - admin → /admin;
 * - quien sólo explora → "Mi espacio".
 * Sin cuenta devuelve `null`. Es un módulo puro: sirve en servidor y cliente.
 * Pasale datos leídos de la base (`getFreshAccount`) cuando decida el servidor.
 */
export function resolvePanelLink(account: Pick<FreshAccount, "role" | "agencyId"> | null | undefined): PanelLink | null {
  if (!account) return null;
  if (account.role === "admin") return { href: "/admin", label: "Admin", kind: "admin" };
  if (isAgencyRole(account.role)) {
    return account.agencyId
      ? { href: "/dashboard", label: "Mi panel", kind: "dashboard" }
      : { href: "/publicar", label: "Creá tu inmobiliaria", kind: "onboarding" };
  }
  return { href: "/espacio", label: "Mi espacio", kind: "espacio" };
}
