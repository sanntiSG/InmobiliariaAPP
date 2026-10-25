/**
 * Lo que el navegador recibe de la configuración de un agente. Módulo sin base de datos ni variables de entorno: lo
 * importan también componentes del cliente (el estudio del admin arma con esto la vista previa del borrador).
 */
import { AGENTS, type AgentId } from "@/lib/agents/registry";
import type { AdvisorContent, AdvisorFraming, AdvisorRoles, ClipInfo } from "./config";

/** Lo único que recibe el navegador de cualquier persona. */
export type PublicAdvisorConfig = {
  /** Qué agente es (`advisor` si no se indica). */
  id: AgentId;
  /** Su rol, para distinguirlo en el selector cuando comparten modelo y no tienen nombre: "Marketing". */
  roleLabel: string;
  name: string;
  /** El nombre para mostrar: lo que definió el admin o su rol ("Asesor", "Marketing"). */
  displayName: string;
  /** Complemento para "Preguntale …": "a Nubi" si tiene nombre, "al asesor" si no (nunca "a Asesor"). */
  ctaTo: string;
  description: string;
  enabled: { agency: boolean; explorer: boolean };
  modelUrl: string;
  clips: ClipInfo[];
  roles: AdvisorRoles;
  disabled: string[];
  framing: AdvisorFraming;
  poster: string | null;
};

export function toPublicConfig(c: AdvisorContent, agentId: AgentId = "advisor"): PublicAdvisorConfig {
  const def = AGENTS[agentId];
  return {
    id: agentId,
    roleLabel: def.roleLabel,
    name: c.name,
    displayName: c.name || def.roleLabel,
    ctaTo: c.name ? `a ${c.name}` : def.ctaFallback,
    description: c.description,
    enabled: c.enabled,
    modelUrl: c.model.url,
    clips: c.clips,
    roles: c.roles,
    disabled: c.disabled,
    framing: c.framing,
    poster: c.poster ?? null,
  };
}
