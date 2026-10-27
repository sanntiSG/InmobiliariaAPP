/**
 * Qué agentes se muestran en la portada y para quién está cada uno. Los datos salen de lo que el admin publicó (nombre, a quién
 * está dirigido, imagen) y del registro de agentes (rol y a quién puede servir por naturaleza), NUNCA de nombres escritos en el
 * código: el admin puede cambiarlos cuando quiera y la portada los sigue. Un agente apagado para todos no aparece. Puro: se
 * prueba sin base de datos.
 */
import { AGENT_IDS, AGENTS, type AgentAudience, type AgentId } from "./registry";

/** Para quién está disponible: todos (explorar y gestionar), sólo inmobiliarias o sólo quien busca propiedades. */
export type HomeAudience = "all" | "agency" | "explorer";

export type HomeAgentCard = {
  id: AgentId;
  /** El nombre que le puso el admin; si no tiene, su rol. */
  name: string;
  /** Su rol ("Asesor", "Marketing", "Correo"); se muestra aparte del nombre. */
  role: string;
  /** Qué hace, en una línea (del registro de agentes). */
  tagline: string;
  audience: HomeAudience;
  /** Imagen de su póster si el admin la capturó; si no, la tarjeta usa su ícono de rol. */
  poster: string | null;
};

/** Lo mínimo que se necesita de lo publicado de cada agente. */
export type PublishedAgentLike = { name: string; enabled: { agency: boolean; explorer: boolean }; poster?: string | null };

export function homeAgentCards(published: Record<AgentId, PublishedAgentLike>): HomeAgentCard[] {
  const cards: HomeAgentCard[] = [];
  for (const id of AGENT_IDS) {
    const def = AGENTS[id];
    const content = published[id];
    if (!content) continue;
    // Disponible para un público sólo si el admin lo habilitó Y el agente puede servirle (marketing y correo son de inmobiliarias).
    const serves = (aud: AgentAudience) => def.audiences.includes(aud) && !!content.enabled[aud];
    const agency = serves("agency");
    const explorer = serves("explorer");
    if (!agency && !explorer) continue;
    cards.push({
      id,
      name: content.name.trim() || def.roleLabel,
      role: def.roleLabel,
      tagline: def.tagline,
      audience: agency && explorer ? "all" : agency ? "agency" : "explorer",
      poster: content.poster ?? null,
    });
  }
  return cards;
}

export const HOME_AUDIENCE_LABELS: Record<HomeAudience, string> = {
  all: "Para todos",
  agency: "Solo para inmobiliarias",
  explorer: "Solo para quienes buscan",
};
