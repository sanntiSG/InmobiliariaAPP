import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils/cn";

export type FilterPillProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  /** Badge numérico chico, ej: cantidad de filtros avanzados aplicados. */
  count?: number;
};

/** Pill de filtro horizontal — ver referencia visual (fila de filtros). */
export const FilterPill = forwardRef<HTMLButtonElement, FilterPillProps>(
  ({ className, active = false, count, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        aria-pressed={active}
        className={cn(
          "relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-4 h-10 text-sm font-medium shrink-0",
          "transition-[transform,background-color,color,border-color] duration-150 [transition-timing-function:var(--ease-out)]",
          "active:scale-[0.97]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          active
            ? "bg-accent-soft border-accent/30 text-accent"
            : "bg-surface border-border text-text hover:bg-surface-2",
          className
        )}
        {...props}
      >
        {children}
        {typeof count === "number" && count > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-contrast">
            {count}
          </span>
        )}
      </button>
    );
  }
);
FilterPill.displayName = "FilterPill";
