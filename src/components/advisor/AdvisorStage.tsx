"use client";

import { RotateCcw } from "lucide-react";
import { AdvisorThread } from "./AdvisorThread";
import { StageFrame } from "./StageFrame";
import { resetThread, useAdvisorState } from "./store";

/**
 * El escenario del agente que está abierto: el marco común (`StageFrame`) con el contenido de ese agente adentro. Hoy sólo
 * está el asesor (una conversación); los demás agentes se suman acá con su propio contenido.
 */
export default function AdvisorStage() {
  const s = useAdvisorState();
  const { open, mode, config } = s;
  const thread = s.threads[mode];
  const pending = thread.turns.some((t) => t.role === "assistant" && t.status === "pending");

  return (
    <StageFrame
      open={open}
      origin={s.origin}
      config={config}
      preview={s.preview}
      busyLabel={pending ? "Analizando" : null}
      ariaLabel={`Conversación con ${config?.displayName ?? "el asesor"}`}
      headerActions={
        thread.turns.length > 0 ? (
          <button type="button" onClick={() => resetThread(mode)} className="advisor-icon-btn" aria-label="Empezar una charla nueva" title="Charla nueva">
            <RotateCcw className="h-[18px] w-[18px]" aria-hidden />
          </button>
        ) : null
      }
    >
      <AdvisorThread mode={mode} />
    </StageFrame>
  );
}
