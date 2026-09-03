import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils/cn";

const VARIANTS = {
  solid: "bg-surface text-text shadow-pop hover:bg-surface-2",
  ghost: "bg-transparent text-text hover:bg-surface-2",
  accent: "bg-accent text-accent-contrast hover:bg-accent-hover",
} as const;

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
  size?: number;
  "aria-label": string;
};

/** Botón circular para acciones puntuales: favorito, zoom del mapa, cerrar. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = "solid", size = 40, style, ...props }, ref) => {
    return (
      <button
        ref={ref}
        style={{ width: size, height: size, ...style }}
        className={cn(
          "inline-flex items-center justify-center rounded-full shrink-0",
          "transition-[transform,background-color,box-shadow] duration-150 [transition-timing-function:var(--ease-out)]",
          "active:scale-[0.94]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          "disabled:opacity-50 disabled:pointer-events-none",
          VARIANTS[variant],
          className
        )}
        {...props}
      />
    );
  }
);
IconButton.displayName = "IconButton";
