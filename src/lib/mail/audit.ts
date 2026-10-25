import { logActivity } from "@/lib/activity/log";
import { rateLimit } from "@/lib/security/rate-limit";
import type { MailAccess } from "./access";

/**
 * Cuando el admin abre el CONTENIDO del correo de una inmobiliaria ("viendo como"), queda anotado en la bitácora de esa
 * inmobiliaria (una vez por hora, para no llenarla). Para las personas de la inmobiliaria no hace nada.
 */
export async function noteAdminView(a: MailAccess): Promise<void> {
  if (!a.isAdmin) return;
  const first = await rateLimit(`mail-admin-view:${a.userId}:${a.agencyId}`, 1, 60 * 60, { failOpen: true });
  if (first.ok) await logActivity({ agencyId: a.agencyId, actorId: a.userId, actorRole: "admin", kind: "mail_admin_viewed" });
}
