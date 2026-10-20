/** Formatos y utilidades de redacción compartidos por todas las respuestas (es-AR). */
import { formatPrice } from "@/lib/utils/format";

const NF = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const NF1 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

export const n0 = (v: number): string => NF.format(Math.round(v));
export const n1 = (v: number): string => NF1.format(v);

/** "12 %" — recibe un número ya en porcentaje (12) o una proporción con `fromRatio`. */
export function pct(v: number | null | undefined, opts: { fromRatio?: boolean; digits?: number } = {}): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const value = opts.fromRatio ? v * 100 : v;
  const digits = opts.digits ?? (Math.abs(value) < 10 && value !== 0 ? 1 : 0);
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: digits }).format(value)} %`;
}

/** "+12 %" / "−8 %" (con el signo menos tipográfico). */
export function signedPct(v: number | null | undefined, digits?: number): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const body = pct(Math.abs(v), { digits });
  return v > 0 ? `+${body}` : v < 0 ? `−${body}` : body;
}

export function money(amount: number, currency: string): string {
  return formatPrice(amount, currency);
}

export const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);
export const count = (n: number, one: string, many: string): string => `${n0(n)} ${plural(n, one, many)}`;

/** "a, b y c" */
export function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/**
 * Elige una variante de forma determinística según la semilla (turno +
 * intención): la misma pregunta en el mismo punto de la charla suena igual,
 * pero dos respuestas seguidas no repiten la fórmula.
 */
export function pick<T>(variants: readonly T[], seed: number): T {
  return variants[Math.abs(seed) % variants.length]!;
}

export function seedOf(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.join("|")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const DAY_MS = 86_400_000;

/** "hoy", "ayer", "hace 5 días", "hace 2 semanas". */
export function daysAgo(date: Date, now = new Date()): string {
  const days = Math.floor((now.getTime() - date.getTime()) / DAY_MS);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 14) return `hace ${days} días`;
  if (days < 60) return `hace ${Math.round(days / 7)} semanas`;
  return `hace ${Math.round(days / 30)} meses`;
}

export function clip(text: string, max = 56): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Título entre comillas angulares, recortado: «Casa en Canning». */
export const quote = (title: string, max = 48): string => `«${clip(title, max)}»`;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

/** Variación porcentual; `null` si no hay base (ambos 0). 100 si antes era 0 y ahora hay. */
export function change(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}
