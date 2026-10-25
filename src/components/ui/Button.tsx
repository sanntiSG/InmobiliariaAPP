import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils/cn";

// Primario: acento "levantado" (brillo arriba + sombra corta). Secundario: superficie con anillo fino. Fantasma: sin
// nada hasta el hover, cuando aparece el borde. Todos con borde de 1 px para que no cambie la medida al pasar el puntero.
const VARIANTS = {
  primary: "border border-transparent bg-accent text-accent-contrast shadow-btn hover:bg-accent-hover",
  secondary: "border border-border-hi bg-surface-2 text-text shadow-[inset_0_1px_0_var(--highlight)] hover:bg-surface-3",
  ghost: "border border-transparent bg-transparent text-text hover:border-border hover:bg-surface-2",
  danger: "border border-transparent bg-danger text-danger-contrast hover:brightness-95",
} as const;

const SIZES = {
  // 36 px con mouse; 44 px en pantallas táctiles y angostas (el dedo necesita más blanco).
  sm: "h-9 px-3.5 text-sm gap-1.5 pointer-coarse:h-11 max-sm:h-11",
  md: "h-11 px-5 text-[15px] gap-2",
  lg: "h-12 px-6 text-base gap-2",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

/**
 * Clases del botón como función pura, para reusar el mismo look en
 * elementos que no pueden ser un <button> (ej: <Link>, <a>) sin necesitar
 * un patrón asChild/Slot.
 */
export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-pill font-medium",
    "transition-[transform,background-color,border-color,box-shadow] duration-150 [transition-timing-function:var(--ease-out)]",
    "active:scale-[0.97]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
    "disabled:opacity-50 disabled:pointer-events-none",
    VARIANTS[variant],
    SIZES[size],
    className
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

/**
 * Botón base. La respuesta a la presión (scale 0.97) es lo que hace que se
 * sienta "escuchado" — ver .impeccable.md, principio 5.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return <button ref={ref} className={buttonClasses(variant, size, className)} {...props} />;
  }
);
Button.displayName = "Button";
