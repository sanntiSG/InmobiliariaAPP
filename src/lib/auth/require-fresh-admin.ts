import { getFreshAccount } from "@/lib/auth/fresh-account";
import { requireAdminUser } from "@/lib/auth/require-admin";

/**
 * Admin confirmado contra la BASE (no sólo contra el JWT, que puede estar desactualizado hasta 60 s):
 * para las rutas que cambian configuración global de la plataforma.
 */
export async function requireFreshAdmin() {
  const user = await requireAdminUser();
  if (!user) return null;
  const fresh = await getFreshAccount(user.id);
  return fresh?.role === "admin" ? user : null;
}
