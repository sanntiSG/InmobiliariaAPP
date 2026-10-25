"use client";

import dynamic from "next/dynamic";
import { RotateCcw } from "lucide-react";
import { AdvisorThread } from "./AdvisorThread";
import { StageFrame } from "./StageFrame";
import { resetThread, stageConfig, useAdvisorState } from "./store";

// Cada agente trae su escenario cuando se abre (el de marketing no pesa para quien sólo usa al asesor).
const MarketingStage = dynamic(() => import("@/components/agents/marketing/MarketingStage"), { ssr: false });
const MailStage = dynamic(() => import("@/components/agents/mail/MailStage"), { ssr: false });

/**
 * El escenario del agente que está abierto: el marco común (`StageFrame`) con el contenido de ese agente adentro. El asesor
 * es una conversación; marketing (pasos guiados) y correo (el escritorio de mails) traen el suyo.
 */
export default function AdvisorStage() {
  const s = useAdvisorState();
  const { open, mode } = s;
  const config = stageConfig(s);
  const advisor = s.agent === "advisor";
  const thread = s.threads[mode];
  const pending = advisor && thread.turns.some((t) => t.role === "assistant" && t.status === "pending");

  return (
    <StageFrame
      open={open}
      origin={s.origin}
      config={config}
      preview={s.preview}
      busyLabel={pending ? "Analizando" : null}
      ariaLabel={advisor ? `Conversación con ${config?.displayName ?? "el asesor"}` : (config?.displayName ?? "Agente")}
      headerActions={
        advisor && thread.turns.length > 0 ? (
          <button type="button" onClick={() => resetThread(mode)} className="advisor-icon-btn" aria-label="Empezar una charla nueva" title="Charla nueva">
            <RotateCcw className="h-[18px] w-[18px]" aria-hidden />
          </button>
        ) : null
      }
    >
      {advisor ? <AdvisorThread mode={mode} /> : s.agent === "marketing" ? <MarketingStage /> : <MailStage />}
    </StageFrame>
  );
}
