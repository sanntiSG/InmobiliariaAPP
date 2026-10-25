import { AGENTS, type AgentId } from "@/lib/agents/registry";
import { getAdminConfigState, getPublishedConfig } from "./config";

/** Cómo se presenta el agente en sus textos ("Soy Nubo"). */
export type Persona = { name: string };

/** Persona publicada; con `draft` (sólo para la prueba del admin) usa el borrador. Sin nombre: "tu asesor", "tu agente de correo"… */
export async function getPersona(opts: { draft?: boolean; agentId?: AgentId } = {}): Promise<Persona> {
  const agentId = opts.agentId ?? "advisor";
  const generic = AGENTS[agentId].roleNoun;
  try {
    const content = opts.draft ? (await getAdminConfigState(agentId)).draft : await getPublishedConfig(agentId);
    return { name: content.name || generic };
  } catch {
    return { name: generic };
  }
}
