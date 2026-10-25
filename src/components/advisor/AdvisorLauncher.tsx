"use client";

import { useRef } from "react";
import { usePathname } from "next/navigation";
import { MascotFallback } from "./mascot/MascotFallback";
import { modeFor, openAdvisor, useAdvisorState } from "./store";

/** Páginas donde el asesor flotante estorba (o no corresponde). */
const HIDDEN_ON = ["/ingresar", "/crear-cuenta", "/admin/asesor"];

/**
 * El asesor siempre a mano: un botón flotante con su imagen (sin cargar three.js hasta que se
 * abre). Al acercarse el mouse o tocarlo se precarga el escenario, así abre sin esperar.
 */
export function AdvisorLauncher({ onWarm }: { onWarm: () => void }) {
  const s = useAdvisorState();
  const pathname = usePathname();
  const ref = useRef<HTMLButtonElement>(null);
  const { config, open } = s;
  const mode = s.preview ? s.mode : modeFor(s.account);

  if (!config || open || !config.enabled[mode] || HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  return (
    <button
      ref={ref}
      type="button"
      className="advisor-launcher"
      data-map={pathname.startsWith("/mapa") ? "true" : undefined}
      aria-label={`Abrir ${config.displayName}, tu asesor`}
      onPointerEnter={onWarm}
      onFocus={onWarm}
      onClick={() => openAdvisor({ origin: ref.current?.getBoundingClientRect() ?? null })}
    >
      <MascotFallback poster={config.poster} />
      <span className="advisor-launcher-tip" aria-hidden>
        Preguntale {config.ctaTo}
      </span>
    </button>
  );
}
