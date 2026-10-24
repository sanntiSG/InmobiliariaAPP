import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils/cn";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Se levanta 3 px y gana sombra al pasar el mouse (sin animar box-shadow) — usar en cards clickeables. */
  interactive?: boolean;
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, interactive = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "bg-surface rounded-card shadow-card",
          interactive && "lift cursor-pointer",
          className
        )}
        {...props}
      />
    );
  }
);
Card.displayName = "Card";
