import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Insignia de la portada viva en tarjetas y popups. A diferencia de `TourBadge` (el acento de identidad de la
 * plataforma) es un chip oscuro y discreto: avisa que la propiedad tiene una portada que cambia de día a noche, sin
 * competir con el precio ni con el recorrido 360°. Sin desenfoque: hay decenas de tarjetas en pantalla.
 */
export function AmbientBadge({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill bg-black/60 pl-1.5 pr-2.5 py-1 text-xs font-semibold leading-none text-white",
        compact && "pr-1.5",
        className
      )}
      title="Portada viva: se ve de día, de noche, con lluvia y con viento"
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden />
      {compact ? <span className="sr-only">Portada viva</span> : "Portada viva"}
    </span>
  );
}
