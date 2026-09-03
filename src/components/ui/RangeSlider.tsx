"use client";

import { cn } from "@/lib/utils/cn";

export type RangeSliderProps = {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  formatValue?: (n: number) => string;
};

const thumbClasses = cn(
  "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:pointer-events-auto",
  "[&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full",
  "[&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface",
  "[&::-webkit-slider-thumb]:shadow-pop [&::-webkit-slider-thumb]:cursor-pointer",
  "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5",
  "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:border-2",
  "[&::-moz-range-thumb]:border-surface [&::-moz-range-thumb]:cursor-pointer"
);

/** Slider de rango doble (ej: precio mín/máx) — dos <input type=range> superpuestos. */
export function RangeSlider({ min, max, step = 1, value, onChange, formatValue }: RangeSliderProps) {
  const [lo, hi] = value;
  const pct = (n: number) => ((n - min) / (max - min)) * 100;
  const fmt = formatValue ?? ((n: number) => String(n));

  return (
    <div className="w-full">
      <div className="mb-3 flex justify-between text-sm font-semibold tabular-nums">
        <span>{fmt(lo)}</span>
        <span>{fmt(hi)}</span>
      </div>
      <div className="relative h-5">
        <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-surface-2" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent"
          style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
        />
        <input
          type="range"
          aria-label="Precio mínimo"
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi - step), hi])}
          className={cn("absolute inset-0 w-full appearance-none bg-transparent pointer-events-none", thumbClasses)}
        />
        <input
          type="range"
          aria-label="Precio máximo"
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo + step)])}
          className={cn("absolute inset-0 w-full appearance-none bg-transparent pointer-events-none", thumbClasses)}
        />
      </div>
    </div>
  );
}
