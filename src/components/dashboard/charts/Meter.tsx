import { cn } from "@/lib/utils/cn";

/**
 * Medidor de una razón contra una escala. El relleno va en el acento y el
 * riel es un paso más claro de la misma rampa. `reference` marca con una
 * línea fina el valor típico de propiedades similares, para leer de un vistazo
 * si está por encima o por debajo.
 */
export function Meter({
  label,
  caption,
  value,
  reference,
  scaleMax,
  valueText,
  className,
}: {
  label: string;
  /** Línea chica debajo (ej: "12 de 340 visitas"). */
  caption?: string;
  /** Razón 0–1, o `null` si todavía no hay datos suficientes. */
  value: number | null;
  reference?: number | null;
  /** Fin de la escala (0–1). Por defecto se ajusta al mayor entre el valor y la referencia. */
  scaleMax?: number;
  valueText: string;
  className?: string;
}) {
  const max = scaleMax ?? Math.max(value ?? 0, reference ?? 0, 0.05) * 1.4;
  const pct = (n: number) => `${Math.min(100, Math.max(0, (n / max) * 100))}%`;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-text">{label}</span>
        <span className="font-display text-lg font-semibold text-text">{value == null ? "—" : valueText}</span>
      </div>
      <div
        className="relative h-2 rounded-full bg-accent-soft"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.round(max * 100)}
        aria-valuenow={value == null ? undefined : Math.round(value * 100)}
        aria-valuetext={value == null ? "Sin datos suficientes" : valueText}
      >
        {value != null && (
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-500 [transition-timing-function:var(--ease-out)]"
            style={{ width: pct(value) }}
          />
        )}
        {reference != null && (
          <div
            className="absolute -inset-y-1 w-0.5 rounded-full bg-text-muted"
            style={{ left: pct(reference) }}
            title="Propiedades similares"
          />
        )}
      </div>
      <p className="text-xs text-text-muted">
        {value == null ? "Todavía no hay datos suficientes." : caption}
        {reference != null && value != null && (
          <>
            {caption ? " · " : ""}
            similares: {(reference * 100).toFixed(reference < 0.1 ? 1 : 0)}%
          </>
        )}
      </p>
    </div>
  );
}
