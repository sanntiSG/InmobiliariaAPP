import { Mail, Megaphone, Search, type LucideIcon } from "lucide-react";
import type { AgentId } from "@/lib/agents/registry";

/**
 * Insignia de rol de cada agente. Los tres comparten la misma mascota (y sin nombre se parecen), así que el selector se
 * apoya en el ícono y en la etiqueta para distinguirlos: lupa = asesor, megáfono = marketing, sobre = correo.
 */
export const AGENT_ICONS: Record<AgentId, LucideIcon> = {
  advisor: Search,
  marketing: Megaphone,
  mail: Mail,
};
