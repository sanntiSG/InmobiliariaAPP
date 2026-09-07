import { Orbit } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Badge del recorrido 360° — el elemento de identidad visual de la
 * plataforma (ver plan): distinto a un badge genérico, con ícono de
 * órbita en vez de un ícono de cámara/play cualquiera.
 */
export function TourBadge({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill bg-accent pl-1.5 pr-2.5 py-1 text-xs font-semibold leading-none text-accent-contrast",
        className
      )}
    >
      <Orbit className="h-3.5 w-3.5" aria-hidden />
      {!compact && "Recorrido 360°"}
    </span>
  );
}
