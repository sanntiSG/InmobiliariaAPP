import { CalendarDays } from "lucide-react";
import { formatDay, todayAr, type RentalStatus } from "@/lib/availability";
import { AvailabilityBadge } from "./AvailabilityBadge";
import { WatchAvailabilityButton } from "./WatchAvailabilityButton";

/**
 * La disponibilidad de un alquiler en la ficha: el estado de hoy, los períodos que ya están ocupados y, si hoy no se puede
 * alquilar, el botón para que avisen cuando se libere. No es un sistema de reservas: sólo comunica con claridad cuándo se puede.
 */
export function RentalAvailability({
  status,
  busy,
  propertyId,
  isAuthenticated,
  initialWatching,
  returnTo,
  canWatch,
}: {
  status: RentalStatus;
  busy: { from: string; to: string }[];
  propertyId: string;
  isAuthenticated: boolean;
  initialWatching: boolean;
  returnTo: string;
  /** Sólo se ofrece el aviso en una propiedad publicada. */
  canWatch: boolean;
}) {
  const today = todayAr();
  return (
    <section aria-label="Disponibilidad" className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-text">
        <CalendarDays className="h-4 w-4 text-text-muted" aria-hidden /> Disponibilidad
      </h2>
      <AvailabilityBadge rental={status} className="text-xs" />
      {busy.length > 0 && (
        <div className="text-sm text-text-muted">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide">Ocupada</p>
          <ul className="flex flex-col gap-0.5">
            {busy.map((r) => (
              <li key={`${r.from}-${r.to}`}>{r.from === r.to ? `El ${formatDay(r.from, today)}` : `Del ${formatDay(r.from, today)} al ${formatDay(r.to, today)}`}</li>
            ))}
          </ul>
        </div>
      )}
      {canWatch && status.state === "unavailable" && <WatchAvailabilityButton propertyId={propertyId} isAuthenticated={isAuthenticated} initialWatching={initialWatching} returnTo={returnTo} />}
    </section>
  );
}
