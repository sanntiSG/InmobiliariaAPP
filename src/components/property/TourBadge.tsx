import { cn } from "@/lib/utils/cn";

/**
 * Badge del Digital Twin — el elemento de identidad visual de la
 * plataforma (ver plan): distinto a un badge genérico, con ícono de
 * órbita 360° propio en vez de un ícono de cámara/play cualquiera.
 */
export function TourBadge({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill bg-accent pl-1.5 pr-2.5 py-1 text-xs font-semibold leading-none text-accent-contrast",
        className
      )}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden>
        <ellipse cx="12" cy="12" rx="9" ry="4" stroke="currentColor" strokeWidth="1.6" />
        <ellipse
          cx="12"
          cy="12"
          rx="9"
          ry="4"
          stroke="currentColor"
          strokeWidth="1.6"
          transform="rotate(60 12 12)"
        />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
      </svg>
      {!compact && "Recorrido 3D"}
    </span>
  );
}
