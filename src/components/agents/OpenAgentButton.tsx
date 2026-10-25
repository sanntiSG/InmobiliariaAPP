"use client";

import { Button } from "@/components/ui/Button";
import { openAgent } from "@/components/advisor/store";
import type { AgentId } from "@/lib/agents/registry";

/** Abre el escenario del agente desde una tarjeta del panel (la animación de apertura sale del propio botón). */
export function OpenAgentButton({ id, label }: { id: AgentId; label: string }) {
  return (
    <Button size="sm" onClick={(e) => openAgent(id, { origin: e.currentTarget.getBoundingClientRect() })}>
      {label}
    </Button>
  );
}
