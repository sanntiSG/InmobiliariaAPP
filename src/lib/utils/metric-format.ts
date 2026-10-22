const nf = new Intl.NumberFormat("es-AR");

/** Cómo se muestra un valor de indicador. Vive acá (no en el componente) para que lo compartan el servidor y `CountUp`. */
export const METRIC_FORMATS = {
  int: (n: number) => nf.format(n),
  seconds: (n: number) => (n >= 60 ? `${Math.floor(n / 60)} min ${n % 60 ? `${n % 60} s` : ""}`.trim() : `${n} s`),
} as const;

export type MetricFormat = keyof typeof METRIC_FORMATS;

export const formatMetric = (format: MetricFormat, n: number) => METRIC_FORMATS[format](n);
