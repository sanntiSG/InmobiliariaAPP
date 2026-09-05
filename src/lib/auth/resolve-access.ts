import { connectDB } from "@/lib/db/connect";
import { User } from "@/lib/db/models/User";
import { AllowedEmail } from "@/lib/db/models/AllowedEmail";
import { ADMIN_EMAILS } from "@/config/site";

export type ResolvedAccess = {
  role: "admin" | "agency_owner" | "agency_agent" | "user";
  agencyId: string | null;
  /** true cuando tiene permiso de agencia pero todavía no creó su inmobiliaria (Flujo B de AllowedEmail). */
  needsOnboarding: boolean;
};

/**
 * Única fuente de verdad para resolver rol + agencyId de un email al iniciar
 * sesión. Se usa desde el callback `signIn` de `src/auth.ts` — nunca degrada
 * a un usuario que ya tiene un rol de agencia legítimo.
 *
 * Orden de precedencia:
 * 1. `ADMIN_EMAILS` → admin.
 * 2. Fila en `AllowedEmail` → su `role`/`agencyId` (agencyId null = falta onboarding).
 * 3. Usuario ya existente con rol de agencia y agencyId válido (ej. creado por
 *    `POST /api/admin/agencies` con contraseña) → conserva su rol.
 * 4. Cualquier otro caso → "user".
 */
export async function resolveAccessForEmail(rawEmail: string): Promise<ResolvedAccess> {
  const email = rawEmail.toLowerCase();

  if (ADMIN_EMAILS.includes(email)) {
    return { role: "admin", agencyId: null, needsOnboarding: false };
  }

  await connectDB();

  const allowed = await AllowedEmail.findOne({ email }).lean();
  if (allowed) {
    const agencyId = allowed.agencyId ? String(allowed.agencyId) : null;
    return {
      role: (allowed.role as "agency_owner" | "agency_agent") ?? "agency_owner",
      agencyId,
      needsOnboarding: !agencyId,
    };
  }

  const existing = await User.findOne({ email }).lean();
  if (
    existing &&
    (existing.role === "agency_owner" || existing.role === "agency_agent") &&
    existing.agencyId
  ) {
    return { role: existing.role, agencyId: String(existing.agencyId), needsOnboarding: false };
  }

  return { role: "user", agencyId: null, needsOnboarding: false };
}
