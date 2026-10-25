"use client";

import { useStage } from "@/components/advisor/StageFrame";

const COPY: Record<string, { lead: string; detail: string }> = {
  marketing: {
    lead: "Todavía estoy aprendiendo mi trabajo.",
    detail: "Pronto te voy a preparar, paso a paso, la imagen y el texto de tus publicaciones para redes.",
  },
  mail: {
    lead: "Todavía estoy aprendiendo mi trabajo.",
    detail: "Pronto voy a leer las consultas que lleguen a tu casilla y te voy a dejar las respuestas listas para confirmar.",
  },
};

/** Cuerpo provisorio de un agente cuyo escenario todavía no está listo (se reemplaza por el definitivo en cada etapa). */
export function AgentSoon() {
  const { config } = useStage();
  const copy = COPY[config.id] ?? COPY.marketing!;
  return (
    <section className="advisor-thread-wrap">
      <div className="advisor-thread">
        <div className="flex flex-col gap-3">
          <p className="advisor-lead">{copy.lead}</p>
          <p className="max-w-prose text-[15px] text-text-muted">{copy.detail}</p>
        </div>
      </div>
    </section>
  );
}
