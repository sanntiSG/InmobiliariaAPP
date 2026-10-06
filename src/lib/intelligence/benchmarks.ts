import { Property } from "@/lib/db/models/Property";
import { memo } from "./cache";
import { consultas, getPropertyMetrics, ratio, avgDwellSec } from "./metrics";

/** Referencias de comparación para saber si una propiedad rinde mucho o poco. */
export type Bench = {
  /** Propiedades con datos suficientes que entraron al cálculo. */
  n: number;
  /** Mediana de consultas / visitas. */
  inquiryRate: number | null;
  /** Mediana de guardados / visitas. */
  saveRate: number | null;
  medianViews30: number | null;
  medianDwellSec: number | null;
};

export type Benchmarks = { platform: Bench; byKey: Record<string, Bench> };

/** Mínimo de propiedades comparables para usar el grupo (tipo + operación) en vez del total de la plataforma. */
const MIN_GROUP_SIZE = 5;
/** Visitas mínimas en 30 días para que una propiedad cuente en los rates (evita ruido de 1 de 2 visitas). */
const MIN_VIEWS_FOR_RATES = 20;
const TTL_MS = 10 * 60_000;

export const benchKey = (type: string, operation: string) => `${type}:${operation}`;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

type Sample = { views: number; inquiryRate: number | null; saveRate: number | null; dwell: number | null };

function summarize(samples: Sample[]): Bench {
  const rated = samples.filter((s) => s.views >= MIN_VIEWS_FOR_RATES);
  const pick = (f: (s: Sample) => number | null) => rated.map(f).filter((v): v is number => v != null);
  return {
    n: samples.length,
    inquiryRate: median(pick((s) => s.inquiryRate)),
    saveRate: median(pick((s) => s.saveRate)),
    medianViews30: median(samples.map((s) => s.views)),
    medianDwellSec: median(pick((s) => s.dwell)),
  };
}

/**
 * Benchmarks de la plataforma, total y por (tipo + operación), sobre las
 * propiedades publicadas de los últimos 30 días. Cacheados 10 minutos.
 */
export function getBenchmarks(): Promise<Benchmarks> {
  return memo("benchmarks", TTL_MS, async () => {
    const [metrics, props] = await Promise.all([
      getPropertyMetrics({}),
      Property.find({ status: "published" }).select("type operation").limit(5000).lean(),
    ]);

    const all: Sample[] = [];
    const groups = new Map<string, Sample[]>();
    for (const p of props) {
      const m = metrics.get(String(p._id))?.d30;
      // Una propiedad sin ningún dato todavía igual cuenta para "visitas típicas" (con 0).
      const sample: Sample = {
        views: m?.views ?? 0,
        inquiryRate: m ? ratio(consultas(m), m.views) : null,
        saveRate: m ? ratio(m.saves, m.views) : null,
        dwell: m ? avgDwellSec(m) : null,
      };
      all.push(sample);
      const key = benchKey(p.type, p.operation);
      groups.set(key, [...(groups.get(key) ?? []), sample]);
    }

    const byKey: Record<string, Bench> = {};
    for (const [key, samples] of groups) {
      if (samples.length >= MIN_GROUP_SIZE) byKey[key] = summarize(samples);
    }
    return { platform: summarize(all), byKey };
  });
}

/** Benchmark más específico disponible para una propiedad: su grupo, o el total de la plataforma. */
export function benchFor(benchmarks: Benchmarks, type: string, operation: string): Bench {
  return benchmarks.byKey[benchKey(type, operation)] ?? benchmarks.platform;
}
