import { type InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full rounded-pill border border-border bg-surface px-4 h-11 text-[15px] text-text placeholder:text-text-muted",
          "transition-[border-color,box-shadow] duration-150 [transition-timing-function:var(--ease-out)]",
          "focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
