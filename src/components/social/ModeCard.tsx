"use client";

import { MousePointerClick, Wand2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { SocialMode } from "@/lib/social/types";

/** Qué hace cada modo (mismo texto en la primera vez, en el selector permanente y en el agente de marketing). */
export const MODES: { id: SocialMode; title: string; hint: string; badge?: string; icon: LucideIcon }[] = [
  {
    id: "auto",
    title: "Automático",
    badge: "Recomendado",
    hint: "La plataforma seleccionará propiedades, fotografías y diseños automáticamente y preparará contenido para vos.",
    icon: Wand2,
  },
  {
    id: "manual",
    title: "Manual",
    hint: "Vos elegís qué propiedad querés promocionar cada día.",
    icon: MousePointerClick,
  },
];

export type ModeDef = (typeof MODES)[number];

export function ModeCard({
  mode,
  selected,
  onSelect,
  compact = false,
  animated = false,
  disabled = false,
}: {
  mode: ModeDef;
  selected: boolean;
  onSelect: () => void;
  compact?: boolean;
  animated?: boolean;
  disabled?: boolean;
}) {
  const Icon = mode.icon;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      data-reveal={animated ? "" : undefined}
      className={cn(
        "flex flex-col gap-2 rounded-card p-4 text-left transition-[transform,box-shadow,background-color] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        compact ? "bg-surface-2" : "bg-surface shadow-card hover:shadow-float",
        selected && "ring-2 ring-accent",
        disabled && "pointer-events-none opacity-60"
      )}
    >
      <span className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", selected ? "text-accent" : "text-text-muted")} aria-hidden />
        <span className="font-display text-base font-bold text-text">{mode.title}</span>
        {mode.badge && !compact && <span className="rounded-pill bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">{mode.badge}</span>}
      </span>
      <span className="text-sm text-text-muted">{mode.hint}</span>
    </button>
  );
}
