import { availabilityText, type RentalStatus } from "@/lib/availability";
import { cn } from "@/lib/utils/cn";

/**
 * Si un alquiler está disponible hoy, en verde o rojo (los mismos colores del pin del mapa). `compact` dice sólo "Disponible" /
 * "No disponible"; sin él suma desde cuándo está libre o hasta cuándo lo está. No lleva estado ni hooks: sirve en el servidor,
 * en las tarjetas y dentro del popup del mapa.
 */
export function AvailabilityBadge({ rental, compact = false, className }: { rental: RentalStatus; compact?: boolean; className?: string }) {
  const free = rental.state === "available";
  return (
    <span
      className={cn(
        "inline-flex w-fit max-w-full items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-semibold leading-tight",
        free ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
        className
      )}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      <span>{compact ? (free ? "Disponible" : "No disponible") : availabilityText(rental)}</span>
    </span>
  );
}
