"use client";

import { useRef } from "react";
import { usePathname } from "next/navigation";
import { AgentFan } from "@/components/agents/AgentFan";
import { MascotFallback } from "./mascot/MascotFallback";
import { openAgent, useAdvisorState } from "./store";

/** Páginas donde el agente flotante estorba (o no corresponde). */
const HIDDEN_ON = ["/ingresar", "/crear-cuenta", "/admin/agentes", "/admin/asesor"];

/**
 * Los agentes siempre a mano: un botón flotante con la imagen del asesor (sin cargar three.js hasta que se abre). Con un
 * solo agente abre directo su escenario; con varios despliega el abanico. Al acercarse el mouse o tocarlo se precarga el
 * escenario, así abre sin esperar.
 */
export function AdvisorLauncher({ onWarm }: { onWarm: () => void }) {
  const { agents, open } = useAdvisorState();
  const pathname = usePathname();
  const ref = useRef<HTMLButtonElement>(null);

  if (open || agents.length === 0 || HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;
  const map = pathname.startsWith("/mapa");

  if (agents.length > 1) return <AgentFan agents={agents} map={map} onWarm={onWarm} />;

  const only = agents[0]!;
  return (
    <button
      ref={ref}
      type="button"
      className="advisor-launcher"
      data-map={map ? "true" : undefined}
      aria-label={only.id === "advisor" ? `Abrir ${only.displayName}, tu asesor` : `Abrir ${only.displayName}`}
      onPointerEnter={onWarm}
      onFocus={onWarm}
      onClick={() => openAgent(only.id, { origin: ref.current?.getBoundingClientRect() ?? null })}
    >
      <MascotFallback poster={only.poster} />
      <span className="advisor-launcher-tip" aria-hidden>
        {only.id === "advisor" ? `Preguntale ${only.ctaTo}` : `Abrir ${only.displayName}`}
      </span>
    </button>
  );
}
