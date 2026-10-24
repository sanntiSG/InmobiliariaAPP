import { type InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full rounded-pill border border-border-hi bg-surface-sunken px-4 h-11 text-[15px] text-text placeholder:text-text-subtle",
          "transition-[border-color,box-shadow] duration-150 [transition-timing-function:var(--ease-out)]",
          "focus:outline-none focus:border-border-act focus:ring-[3px] focus:ring-accent/25",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
