import { dayStart } from "@/lib/tracking/record";
import type { PeriodId } from "../types";

const DAY_MS = 86_400_000;

export type PeriodRange = { id: PeriodId; from: Date; to: Date; days: number; label: string; short: string };

/**
 * Rango `[from, to)` de un período, con los días en hora Argentina (igual que
 * el rollup `PropertyDailyStat`). "week" y "month" son ventanas móviles de 7 y
 * 30 días que incluyen hoy — las mismas que usa el panel.
 */
export function periodRange(id: PeriodId, now = new Date()): PeriodRange {
  const today = dayStart(now).getTime();
  const at = (offsetDays: number) => new Date(today + offsetDays * DAY_MS);
  switch (id) {
    case "today":
      return { id, from: at(0), to: at(1), days: 1, label: "hoy", short: "hoy" };
    case "yesterday":
      return { id, from: at(-1), to: at(0), days: 1, label: "ayer", short: "ayer" };
    case "week":
      return { id, from: at(-6), to: at(1), days: 7, label: "los últimos 7 días", short: "esta semana" };
    case "prev_week":
      return { id, from: at(-13), to: at(-6), days: 7, label: "la semana anterior", short: "la semana pasada" };
    case "month":
      return { id, from: at(-29), to: at(1), days: 30, label: "los últimos 30 días", short: "este mes" };
    case "prev_month":
      return { id, from: at(-59), to: at(-29), days: 30, label: "los 30 días anteriores", short: "el mes pasado" };
  }
}

const PREVIOUS: Record<PeriodId, PeriodId> = {
  today: "yesterday",
  yesterday: "yesterday",
  week: "prev_week",
  prev_week: "prev_week",
  month: "prev_month",
  prev_month: "prev_month",
};

/** El período inmediatamente anterior de la misma duración, para comparar. */
export const previousOf = (id: PeriodId): PeriodId => PREVIOUS[id];

export const DAYS = DAY_MS;

/** Días enteros (hora Argentina) entre dos fechas. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((dayStart(to).getTime() - dayStart(from).getTime()) / DAY_MS);
}
