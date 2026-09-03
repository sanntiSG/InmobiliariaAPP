import { CURRENCY_SYMBOLS } from "@/config/site";

/** Formatea un precio compacto: 185000 -> "US$185.000" */
export function formatPrice(amount: number, currency: string = "USD"): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  const formatted = new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 0,
  }).format(amount);
  return `${symbol}${formatted}`;
}

/** Formatea un precio abreviado para pins de mapa: 185000 -> "$185k" */
export function formatPriceCompact(amount: number, currency: string = "USD"): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  if (amount >= 1_000_000) {
    return `${symbol}${(amount / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (amount >= 1_000) {
    return `${symbol}${Math.round(amount / 1000)}k`;
  }
  return `${symbol}${amount}`;
}

/** Formatea superficie en m². */
export function formatArea(m2: number): string {
  return `${new Intl.NumberFormat("es-AR").format(m2)} m²`;
}

/** "hace 2 días", "hace 3 horas", etc. */
export function formatRelativeTime(date: Date | string): string {
  const target = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - target.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const divisions: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ];
  const rtf = new Intl.RelativeTimeFormat("es-AR", { numeric: "auto" });
  for (const [unit, secondsInUnit] of divisions) {
    if (Math.abs(diffSec) >= secondsInUnit) {
      return rtf.format(-Math.round(diffSec / secondsInUnit), unit);
    }
  }
  return "recién";
}

/** Formatea un número grande de forma compacta: 1234 -> "1.2 mil" */
export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("es-AR", { notation: "compact" }).format(value);
}
