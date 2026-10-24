"use client";

import type { ReactNode } from "react";
import { NubiIcon } from "@/components/icons/NubiIcon";
import { cn } from "@/lib/utils/cn";
import type { IntentId, Slots } from "@/lib/advisor/types";
import { modeFor, openAdvisor, useAdvisorState } from "./store";

/**
 * Botón que abre el asesor ya con una pregunta hecha ("Investigar por qué" en un hallazgo). La
 * consulta viaja estructurada, así el asesor responde exactamente ese dato sin interpretar texto.
 * No se muestra si el asesor está apagado para quien mira.
 */
export function AdvisorTrigger({
  intent,
  slots,
  label,
  focusPropertyId,
  className,
  children,
}: {
  intent: IntentId;
  slots?: Slots;
  /** Lo que se ve como pregunta del usuario en la charla. */
  label: string;
  focusPropertyId?: string;
  className?: string;
  children?: ReactNode;
}) {
  const { config, account } = useAdvisorState();
  const accountMode = modeFor(account);
  const mode = intent.startsWith("explorer.") ? "explorer" : accountMode;
  if (!config || !config.enabled[mode]) return null;
  // Las preguntas de inmobiliaria sólo tienen sentido para quien gestiona una.
  if (intent.startsWith("agency.") && accountMode !== "agency") return null;

  return (
    <button
      type="button"
      onClick={(e) => openAdvisor({ mode, focusPropertyId, origin: e.currentTarget.getBoundingClientRect(), ask: { query: { intent, slots }, label } })}
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-sm font-semibold text-accent",
        "transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.97]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        className
      )}
    >
      <NubiIcon className="h-3.5 w-3.5" />
      {children ?? label}
    </button>
  );
}
