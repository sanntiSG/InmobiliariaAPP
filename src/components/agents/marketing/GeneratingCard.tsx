"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const STEPS = ["Eligiendo la mejor foto", "Armando el diseño", "Dibujando tu publicación"] as const;
/** Cuándo (ms desde que empieza) se pasa al paso siguiente: la última parte es la que más tarda, por eso se queda ahí. */
const AT = [0, 1100, 2400] as const;

/**
 * La espera mientras se prepara la publicación: un lienzo 4:5 que se "pinta" con un barrido de luz y una lista corta de lo
 * que se está haciendo. Dura hasta que la imagen llegó de verdad (lo decide quien lo usa), no un tiempo fijo. El barrido es
 * sólo transform; con movimiento reducido queda quieto y la lista sigue avisando.
 */
export function GeneratingCard() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timers = AT.slice(1).map((ms, i) => window.setTimeout(() => setStep(i + 1), ms));
    return () => timers.forEach(window.clearTimeout);
  }, []);

  return (
    <div className="grid items-start gap-5 sm:grid-cols-[minmax(0,17rem)_1fr]" role="status" aria-live="polite">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-card bg-surface-2 shadow-card" aria-hidden>
        <span className="agent-sweep absolute inset-y-0 left-0 w-full" />
        <span className="absolute inset-x-[12%] bottom-[10%] flex flex-col gap-2.5">
          <span className="block h-2.5 w-3/5 rounded-full bg-text/10" />
          <span className="block h-4 w-4/5 rounded-full bg-text/12" />
          <span className="block h-2.5 w-2/5 rounded-full bg-text/10" />
        </span>
      </div>
      <ol className="flex flex-col gap-3 pt-1 text-[15px]">
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={label} className={cn("flex items-center gap-3 transition-opacity duration-300", i > step && "opacity-40")}>
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-300",
                  done ? "bg-accent text-accent-contrast" : active ? "bg-accent-soft text-accent" : "bg-surface-2 text-text-muted"
                )}
                aria-hidden
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : <span className={cn("block size-1.5 rounded-full bg-current", active && "agent-pulse")} />}
              </span>
              <span className={cn(active ? "font-semibold text-text" : "text-text-muted")}>{label}…</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
