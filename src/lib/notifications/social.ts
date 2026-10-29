import { notifyAgency } from "./create";
import { socialDedupeKey, socialMessage, socialPushTag, type SocialInput } from "./social-text";

export type { SocialEvent } from "./social-text";

/**
 * Avisa a la inmobiliaria de la actividad sobre sus propiedades (me gusta, guardados, compartidos, puntajes, comentarios y
 * seguidores), al instante. Sin dueño ni agentes, a los admins (ver `agencyRecipients`). Reglas: lo que hace uno mismo no se avisa,
 * el texto no nombra a quien actuó, repetir la acción (dar, quitar y volver a dar un me gusta) avisa una sola vez, y en el
 * dispositivo los avisos de lo mismo se reemplazan en vez de apilarse. Se llama dentro de `after()` y nunca lanza.
 */
export async function notifyAgencySocial(e: SocialInput & { agencyId: string; actorUserId?: string | null; commentId?: string; now?: Date }): Promise<void> {
  try {
    await notifyAgency(
      e.agencyId,
      {
        type: e.event,
        ...socialMessage(e),
        propertyId: e.propertyId,
        dedupeKey: socialDedupeKey({ event: e.event, propertyId: e.propertyId, agencyId: e.agencyId, actor: e.actorUserId, commentId: e.commentId, now: e.now }),
        pushTag: socialPushTag({ event: e.event, propertyId: e.propertyId, agencyId: e.agencyId }),
      },
      { exclude: [e.actorUserId] }
    );
  } catch (err) {
    console.error("notifyAgencySocial failed:", err);
  }
}
