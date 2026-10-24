import { type SelectHTMLAttributes, forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            "w-full appearance-none rounded-pill border border-border-hi bg-surface-sunken px-4 pr-9 h-11 text-[15px] text-text",
            "transition-[border-color,box-shadow] duration-150 [transition-timing-function:var(--ease-out)]",
            "focus:outline-none focus:border-border-act focus:ring-[3px] focus:ring-accent/25",
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
          aria-hidden
        />
      </div>
    );
  }
);
Select.displayName = "Select";
