/**
 * Lo que el servidor decide de una propiedad ANTES de guardarla, sin confiar en el navegador: el período del precio que vale para
 * la operación, el monto llevado a una noche, y la disponibilidad (sólo existe en alquileres). Se usa al crear, al editar y en
 * los seeds, así todos dejan los mismos datos. Módulo puro (sin base de datos).
 */
import type { Currency, PropertyStatus } from "@/config/filters";
import { effectivePeriod, isRentalOperation, perNightAmount, type PricePeriod } from "@/config/pricing";
import { rentalStatus, normalizeBlocked, todayAr, type AvailabilityState, type BlockedRange } from "@/lib/availability";

type Input = {
  operation: string;
  status: PropertyStatus;
  price: { amount: number; currency: Currency; expenses: number; period: string };
  availability?: { state?: AvailabilityState; blocked?: BlockedRange[] } | null;
};

export type Normalized = {
  status: PropertyStatus;
  price: { amount: number; currency: Currency; expenses: number; period: PricePeriod; perNight?: number };
  availability: { state: AvailabilityState; blocked: BlockedRange[]; current: AvailabilityState };
};

/**
 * - El período se corrige a uno válido para la operación (venta = total, alquiler = mensual, temporal = noche/día/semana/quincena/mes).
 * - `perNight` sólo en alquileres: es lo que permite filtrar y ordenar con una regla clara.
 * - Un alquiler marcado como "alquilada" o "reservada" (los estados viejos) sigue PUBLICADO y pasa a "no disponible": la
 *   publicación y la disponibilidad son cosas distintas.
 * - En una venta la disponibilidad no existe: queda en el valor neutro.
 */
export function normalizeRentalFields(input: Input, now: Date = new Date()): Normalized {
  const rental = isRentalOperation(input.operation);
  const period = effectivePeriod(input.operation, input.price.period);
  const perNight = rental ? perNightAmount(input.price.amount, period) : null;

  let status: PropertyStatus = input.status;
  let state: AvailabilityState = input.availability?.state ?? "available";
  if (rental && (status === "rented" || status === "reserved")) {
    status = "published";
    state = "unavailable";
  }

  const blocked = rental ? normalizeBlocked(input.availability?.blocked ?? []) : [];
  if (!rental) state = "available";
  const current = rental ? rentalStatus({ state, blocked }, todayAr(now)).state : "available";

  return {
    status,
    price: { ...input.price, period, ...(perNight != null ? { perNight } : {}) },
    availability: { state, blocked, current },
  };
}
