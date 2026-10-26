/**
 * Qué propiedades se promocionaron hace poco, para que el asesor ("¿qué promociono?") y el agente de marketing (qué publicar
 * hoy) recomienden LO MISMO y ninguno vuelva a sugerir lo que acaba de salir en redes. Antes sólo marketing lo sabía y el asesor
 * podía recomendar la propiedad que el otro agente había publicado ayer. Es el único acceso a base de datos del conocimiento
 * de promoción: `promote.ts` sigue siendo una función pura.
 */
import { connectDB } from "@/lib/db/connect";
import { SocialContent } from "@/lib/db/models/SocialContent";

/** Cuántas de las últimas publicaciones cuentan como "recién promocionadas". */
const RECENT_COUNT = 3;

/** `id de propiedad → días desde que se promocionó` (los últimos tres cuentan como de hace un día). Vacío si no hay inmobiliaria. */
export async function loadPromotedDaysAgo(agencyId: string | null): Promise<Map<string, number>> {
  if (!agencyId) return new Map();
  try {
    await connectDB();
    const doc = await SocialContent.findOne({ agencyId }).select("recent.propertyIds").lean();
    const recent = doc?.recent?.propertyIds ?? [];
    return new Map(recent.slice(-RECENT_COUNT).map((id) => [String(id), 1] as const));
  } catch (err) {
    // No saberlo no debe romper la recomendación: se recomienda sin esa información.
    console.error("loadPromotedDaysAgo failed:", (err as Error)?.message);
    return new Map();
  }
}
