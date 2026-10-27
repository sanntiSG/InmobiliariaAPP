/**
 * Períodos de cobro del precio y la regla de cuáles valen en cada operación. Un solo lugar para el modelo de Mongo, la validación,
 * el formulario, las tarjetas, los filtros, los agentes y las publicaciones para redes: así "/mes" no queda escrito a mano en
 * diez sitios y un precio por noche nunca se compara por error con uno por mes. Módulo puro (sin base de datos).
 */
import type { Operation } from "./filters";

export const PRICE_PERIODS = ["total", "mensual", "noche", "dia", "semana", "quincena"] as const;
export type PricePeriod = (typeof PRICE_PERIODS)[number];

export const PERIOD_LABELS: Record<PricePeriod, string> = {
  total: "Precio total",
  mensual: "Por mes",
  noche: "Por noche",
  dia: "Por día",
  semana: "Por semana",
  quincena: "Por quincena",
};

/** Lo que se agrega al precio ("US$ 80.000 /noche"). El precio total no lleva nada. */
export const PERIOD_SUFFIX: Record<PricePeriod, string> = {
  total: "",
  mensual: "/mes",
  noche: "/noche",
  dia: "/día",
  semana: "/semana",
  quincena: "/quincena",
};

/** Noches que cubre cada período, para compararlos entre sí ("por noche equivalente"). El mes se toma de 30 noches. */
export const PERIOD_NIGHTS: Record<PricePeriod, number | null> = {
  total: null,
  noche: 1,
  dia: 1,
  semana: 7,
  quincena: 15,
  mensual: 30,
};

/** Qué períodos puede tener cada operación: la venta es un precio total, el alquiler de siempre es por mes y el temporal elige. */
export const PERIODS_BY_OPERATION: Record<Operation, readonly PricePeriod[]> = {
  venta: ["total"],
  alquiler: ["mensual"],
  alquiler_temporal: ["noche", "dia", "semana", "quincena", "mensual"],
};

export const DEFAULT_PERIOD: Record<Operation, PricePeriod> = { venta: "total", alquiler: "mensual", alquiler_temporal: "noche" };

/** Las operaciones de alquiler (tradicional y temporal): las que tienen disponibilidad. */
export const RENTAL_OPERATIONS = ["alquiler", "alquiler_temporal"] as const satisfies readonly Operation[];
export const isRentalOperation = (operation: string | null | undefined): boolean => operation === "alquiler" || operation === "alquiler_temporal";

export const isPricePeriod = (value: unknown): value is PricePeriod => (PRICE_PERIODS as readonly string[]).includes(value as string);

/**
 * El período que realmente corresponde: el guardado si es válido para la operación y, si no, el de siempre. Así un alquiler
 * viejo guardado como "total" se muestra "/mes" y una venta nunca queda con un período de alquiler.
 */
export function effectivePeriod(operation: string | null | undefined, period: string | null | undefined): PricePeriod {
  const op = (operation ?? "venta") as Operation;
  const allowed = PERIODS_BY_OPERATION[op] ?? PERIODS_BY_OPERATION.venta;
  if (isPricePeriod(period) && allowed.includes(period)) return period;
  return DEFAULT_PERIOD[op] ?? "total";
}

/** "/mes", "/noche"… (vacío para una venta). */
export const periodSuffix = (operation: string | null | undefined, period: string | null | undefined): string => PERIOD_SUFFIX[effectivePeriod(operation, period)];

/** Es un precio por tiempo (alquiler): sirve para decir "por mes" o "por noche" en frases. */
export const isRecurringPeriod = (period: PricePeriod): boolean => period !== "total";

/** El precio llevado a una noche, o `null` si el período no es de alquiler. Redondea al peso/dólar. */
export function perNightAmount(amount: number, period: PricePeriod): number | null {
  const nights = PERIOD_NIGHTS[period];
  if (!nights || !Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount / nights);
}

/** "por noche", "por mes"… en minúscula, para frases ("US$ 80.000 por noche"). */
export const periodPhrase = (period: PricePeriod): string => (period === "total" ? "" : PERIOD_LABELS[period].toLowerCase());

/** La explicación del filtro de presupuesto del alquiler temporal (se muestra junto al control de precio). */
export const NIGHTLY_RULE = "Se compara por noche: una semana se divide por 7, una quincena por 15 y un mes por 30.";

// ── Distancia a la playa ────────────────────────────────────────────────────

/** Opciones del formulario, en metros (0 = frente al mar). Se guarda el número, no el texto. */
export const BEACH_DISTANCES = [0, 100, 200, 300, 500, 800, 1000, 1500, 2000] as const;

export function beachDistanceLabel(meters: number): string {
  if (meters <= 0) return "Frente al mar";
  if (meters >= 1000) {
    const km = meters / 1000;
    return `A ${Number.isInteger(km) ? km : String(km).replace(".", ",")} km de la playa`;
  }
  return `A ${meters} m de la playa`;
}

/** Topes del filtro "hasta X m de la playa". */
export const BEACH_FILTER_OPTIONS = [100, 300, 500, 1000] as const;
