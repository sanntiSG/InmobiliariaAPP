/**
 * Disponibilidad de una propiedad en alquiler (tradicional o temporal). NO es un sistema de reservas: es lo mínimo para decir
 * con claridad si está disponible, desde cuándo y hasta cuándo está ocupada, y dejar una base sólida para ampliar. Se separa de
 * si la publicación está activa: una propiedad alquilada sigue publicada y visible (en rojo en el mapa).
 *
 * Las fechas son días calendario de Argentina en texto `YYYY-MM-DD` (sin hora, así no hay corrimientos por zona horaria) y se
 * comparan como texto. El estado "ahora" se calcula al leer con la fecha de hoy: cambia solo cuando termina un período.
 * Módulo puro (sin base de datos).
 */

export const AVAILABILITY_STATES = ["available", "unavailable"] as const;
export type AvailabilityState = (typeof AVAILABILITY_STATES)[number];

/** Períodos ocupados que se pueden cargar por propiedad. */
export const MAX_BLOCKED_RANGES = 8;
/** Largo máximo de un período ocupado (un año y un día). */
const MAX_RANGE_DAYS = 366;

export type BlockedRange = { from: string; to: string; note?: string | null };
export type Availability = { state: AvailabilityState; blocked: BlockedRange[] };

export const DEFAULT_AVAILABILITY: Availability = { state: "available", blocked: [] };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ARG_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" });

/** Hoy en Argentina como `YYYY-MM-DD`. */
export const todayAr = (now: Date = new Date()): string => ARG_DAY.format(now);

/** ¿Es un día válido (`YYYY-MM-DD` que existe en el calendario)? */
export function isValidDay(value: string | null | undefined): value is string {
  if (!value || !DAY.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const dayNumber = (value: string): number => Math.floor(new Date(`${value}T00:00:00Z`).getTime() / 86_400_000);

/** Suma días a un `YYYY-MM-DD`. */
export function addDays(value: string, days: number): string {
  return new Date((dayNumber(value) + days) * 86_400_000).toISOString().slice(0, 10);
}

/** Cantidad de días del período, contando ambos extremos. */
export const rangeDays = (r: Pick<BlockedRange, "from" | "to">): number => dayNumber(r.to) - dayNumber(r.from) + 1;

export type RangeError = "invalid" | "inverted" | "too_long";

/** Valida un período: días reales, desde ≤ hasta y no más de un año. */
export function checkRange(r: { from: string; to: string }): RangeError | null {
  if (!isValidDay(r.from) || !isValidDay(r.to)) return "invalid";
  if (r.from > r.to) return "inverted";
  if (rangeDays(r) > MAX_RANGE_DAYS) return "too_long";
  return null;
}

export const RANGE_ERRORS: Record<RangeError, string> = {
  invalid: "Elegí fechas válidas.",
  inverted: "La fecha de fin no puede ser anterior a la de inicio.",
  too_long: "Un período ocupado no puede durar más de un año.",
};

/** Ordena por fecha y junta los períodos que se pisan o son consecutivos, así la lista queda corta y sin repeticiones. */
export function normalizeBlocked(list: readonly BlockedRange[]): BlockedRange[] {
  const sorted = list
    .filter((r) => checkRange(r) === null)
    .map((r) => ({ from: r.from, to: r.to, ...(r.note?.trim() ? { note: r.note.trim().slice(0, 80) } : {}) }))
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : 1));
  const out: BlockedRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.from <= addDays(last.to, 1)) {
      if (r.to > last.to) last.to = r.to;
      if (!last.note && r.note) last.note = r.note;
    } else out.push({ ...r });
  }
  return out;
}

export type RentalStatus = {
  /** Si se puede alquilar hoy. */
  state: AvailabilityState;
  /** Por qué no: la marcó la inmobiliaria ("manual") o hoy cae en un período ocupado ("period"). */
  reason: "manual" | "period" | null;
  /** Si hoy está ocupada por un período, el primer día libre después (para decir "libre desde el 12 de enero"). */
  freeFrom: string | null;
  /** Si hoy está libre y hay un período por venir, cuándo empieza (para decir "ocupada desde…"). */
  nextBusyFrom: string | null;
};

/** El estado de hoy: no disponible si la inmobiliaria lo marcó o si hoy cae dentro de un período ocupado. */
export function rentalStatus(av: Partial<Availability> | null | undefined, today: string = todayAr()): RentalStatus {
  const blocked = normalizeBlocked(av?.blocked ?? []);
  if (av?.state === "unavailable") return { state: "unavailable", reason: "manual", freeFrom: null, nextBusyFrom: null };
  const current = blocked.find((r) => r.from <= today && today <= r.to);
  if (current) return { state: "unavailable", reason: "period", freeFrom: addDays(current.to, 1), nextBusyFrom: null };
  const next = blocked.find((r) => r.from > today);
  return { state: "available", reason: null, freeFrom: null, nextBusyFrom: next?.from ?? null };
}

/** ¿Está libre durante TODO el rango (ambos extremos incluidos)? Una marcada "no disponible" nunca lo está. */
export function isFreeBetween(av: Partial<Availability> | null | undefined, from: string, to: string): boolean {
  if (av?.state === "unavailable") return false;
  return !normalizeBlocked(av?.blocked ?? []).some((r) => r.from <= to && r.to >= from);
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "12 de enero" (agrega el año si no es el actual). */
export function formatDay(value: string, today: string = todayAr()): string {
  if (!isValidDay(value)) return value;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return `${d} de ${MONTHS[m - 1]}${String(y) === today.slice(0, 4) ? "" : ` de ${y}`}`;
}

/** Texto corto del estado para tarjetas, ficha y mapa. */
export function availabilityText(status: RentalStatus, today: string = todayAr()): string {
  if (status.state === "available") return status.nextBusyFrom ? `Disponible hasta el ${formatDay(status.nextBusyFrom, today)}` : "Disponible";
  if (status.reason === "period" && status.freeFrom) return `No disponible · libre desde el ${formatDay(status.freeFrom, today)}`;
  return "No disponible";
}

/** Una clave estable del estado actual: sirve para saber si cambió desde la última vez que se avisó. */
export const availabilityKey = (status: RentalStatus): AvailabilityState => status.state;
