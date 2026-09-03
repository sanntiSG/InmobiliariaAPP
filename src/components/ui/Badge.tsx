import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

const VARIANTS = {
  /** Sobre imagen: chip oscuro translúcido, alto contraste sobre cualquier foto. */
  overlay: "bg-black/55 text-white backdrop-blur-sm",
  accent: "bg-accent text-accent-contrast",
  success: "bg-success text-white",
  neutral: "bg-surface-2 text-text-muted",
  soft: "bg-accent-soft text-accent",
} as const;

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: keyof typeof VARIANTS;
};

export function Badge({ className, variant = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-semibold leading-none",
        VARIANTS[variant],
        className
      )}
      {...props}
    />
  );
}
