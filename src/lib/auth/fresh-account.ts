import { connectDB } from "@/lib/db/connect";
import { User } from "@/lib/db/models/User";

export type FreshAccount = { role: string; agencyId: string | null };

/**
 * Rol y agencia de una persona leídos de la BASE, no de la cookie de sesión.
 *
 * El JWT guarda el rol y la agencia con los que se logueó y recién se
 * refresca cada tanto, así que justo después de que el admin da un permiso,
 * o de que la persona crea su inmobiliaria, el token está desactualizado.
 * Toda decisión de acceso o de qué mostrar según el rol debe salir de acá.
 *
 * Devuelve `null` si la cuenta ya no existe (ej: se borró la inmobiliaria).
 */
export async function getFreshAccount(userId: string): Promise<FreshAccount | null> {
  try {
    await connectDB();
    const user = await User.findById(userId).select("role agencyId").lean();
    if (!user) return null;
    return { role: user.role ?? "user", agencyId: user.agencyId ? String(user.agencyId) : null };
  } catch {
    // id inválido o base caída: se trata como "sin cuenta" (falla cerrado).
    return null;
  }
}

export const isAgencyRole = (role: string | undefined) => role === "agency_owner" || role === "agency_agent";
