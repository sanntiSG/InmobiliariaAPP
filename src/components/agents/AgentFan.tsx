"use client";

import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import type { PublicAdvisorConfig } from "@/lib/advisor/public-config";
import { MascotFallback } from "@/components/advisor/mascot/MascotFallback";
import { openAgent, setFan, useAdvisorState } from "@/components/advisor/store";
import { AGENT_ICONS } from "./agent-icons";

/**
 * El botón flotante cuando hay más de un agente: al tocarlo se despliegan hacia arriba círculos chicos, uno por agente
 * (el asesor, el más cercano). Elegir uno cierra el abanico y abre su escenario desde ese círculo. Sin nombre, los agentes
 * se distinguen por la insignia de rol y por la etiqueta, que se ve siempre (en el celular no hay "hover").
 */
export function AgentFan({ agents, map, onWarm }: { agents: PublicAdvisorConfig[]; map: boolean; onWarm: () => void }) {
  const { fan } = useAdvisorState();
  const pathname = usePathname();
  const mainRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const primary = agents[0]!;

  // Cambiar de página recoge el abanico.
  useEffect(() => {
    setFan(false);
  }, [pathname]);

  // Esc lo recoge y devuelve el foco al botón; al abrirlo con el teclado el foco entra al primer agente.
  useEffect(() => {
    if (!fan) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setFan(false);
      mainRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    const raf = requestAnimationFrame(() => {
      const keyboard = mainRef.current?.matches(":focus-visible");
      if (keyboard) listRef.current?.querySelector<HTMLElement>("button")?.focus();
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(raf);
    };
  }, [fan]);

  // Flechas: arriba/abajo recorren los agentes (el primero queda más cerca del botón).
  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>("button") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (at === -1) return;
    e.preventDefault();
    if (e.key === "ArrowUp") items[Math.min(items.length - 1, at + 1)]?.focus();
    else if (at === 0) mainRef.current?.focus();
    else items[at - 1]?.focus();
  };

  return (
    <>
      {fan && <div className="agent-scrim" onClick={() => setFan(false)} aria-hidden />}
      <div className="agent-dock" data-map={map ? "true" : undefined}>
        <ul ref={listRef} id="agent-fan" className="agent-fan" data-open={fan ? "true" : "false"} aria-label="Agentes" onKeyDown={onListKey}>
          {agents.map((a, i) => {
            const Icon = AGENT_ICONS[a.id];
            return (
              <li key={a.id} style={{ "--i": i } as CSSProperties}>
                <button
                  type="button"
                  className="agent-fan-item"
                  aria-label={a.name ? `Abrir ${a.name}, ${a.roleLabel.toLowerCase()}` : `Abrir ${a.roleLabel.toLowerCase()}`}
                  onPointerEnter={onWarm}
                  onFocus={onWarm}
                  onClick={(e) => {
                    const orb = e.currentTarget.querySelector(".agent-orb");
                    openAgent(a.id, { origin: orb?.getBoundingClientRect() ?? null });
                  }}
                >
                  <span className="agent-fan-label">
                    <span>{a.displayName}</span>
                    {a.name && <span className="agent-fan-role">{a.roleLabel}</span>}
                  </span>
                  <span className="agent-orb">
                    <MascotFallback poster={a.poster} calm />
                    <span className="agent-badge" aria-hidden>
                      <Icon className="h-3 w-3" strokeWidth={2.25} />
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <button
          ref={mainRef}
          type="button"
          className="advisor-launcher agent-main"
          data-open={fan ? "true" : "false"}
          aria-expanded={fan}
          aria-controls="agent-fan"
          aria-label={fan ? "Cerrar la lista de agentes" : "Elegir un agente"}
          onPointerEnter={onWarm}
          onFocus={onWarm}
          onClick={() => setFan(!fan)}
        >
          <MascotFallback poster={primary.poster} />
          <span className="agent-main-x" aria-hidden>
            <X className="h-5 w-5" />
          </span>
          <span className="agent-main-count" aria-hidden>
            {agents.length}
          </span>
          <span className="advisor-launcher-tip" aria-hidden>
            Tus agentes
          </span>
        </button>
      </div>
    </>
  );
}
