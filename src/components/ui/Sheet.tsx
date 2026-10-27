"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { IconButton } from "./IconButton";

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  /** "bottom": drawer mobile-first (usado también para el panel de filtros). */
  side?: "bottom" | "right";
  /** Ancho del cajón lateral: "md" (el de siempre) o "lg" (para editar textos largos). */
  size?: "md" | "lg";
  /**
   * "page" (por defecto): sobre el contenido de la página. "overlay": también por encima del escenario de los agentes
   * (que ocupa toda la pantalla), para abrir un detalle sin cerrarlo.
   */
  layer?: "page" | "overlay";
  /**
   * Sólo con `side="bottom"`: en el celular sube desde abajo como siempre y desde `sm` se muestra como una tarjeta centrada
   * (en vez de una tira a todo lo ancho de la pantalla). Para contenido corto, como compartir.
   */
  centered?: boolean;
  /** Fijo al pie, fuera de la zona que se desplaza (por ejemplo "Limpiar" y "Ver resultados" de los filtros). */
  footer?: ReactNode;
};

const EXIT_MS = 200;

/**
 * Drawer accesible: se desmonta EXIT_MS después de cerrar para poder animar
 * la salida (más rápida que la entrada — ver .impeccable.md / emil-design-eng).
 */
export function Sheet({ open, onClose, children, title, side = "bottom", size = "md", layer = "page", centered = false, footer }: SheetProps) {
  const [shown, setShown] = useState(false);
  const [lingering, setLingering] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // `mounted` se deriva (no es estado): abierto, o cerrándose mientras corre la
  // animación de salida. Todos los setState ocurren dentro de callbacks
  // (rAF/timeout), nunca en el cuerpo del efecto ni durante el render — el
  // patrón anterior de "ajustar estado durante el render" perdía el montaje
  // cuando llegaba el siguiente setState y el cartel se abría y cerraba solo.
  const mounted = open || lingering;

  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() => {
        setLingering(true);
        setShown(true);
      });
      return () => cancelAnimationFrame(raf);
    }
    const raf = requestAnimationFrame(() => setShown(false));
    const t = setTimeout(() => setLingering(false), EXIT_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Sobre el escenario de un agente, Esc cierra sólo este cartel (el escenario ignora los eventos ya atendidos).
      if (layer === "overlay") e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mounted, onClose, layer]);

  if (!mounted) return null;

  return createPortal(
    <div className={cn("fixed inset-0", layer === "overlay" ? "z-[80]" : "z-50")}>
      <div
        className={cn(
          "absolute inset-0 bg-black/40 transition-opacity duration-200 [transition-timing-function:var(--ease-out)]",
          shown ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "absolute bg-surface shadow-float outline-none flex flex-col",
          "transition-transform duration-[280ms] [transition-timing-function:var(--ease-out)]",
          side === "bottom" &&
            cn(
              "inset-x-0 bottom-0 max-h-[85vh] rounded-t-card pt-2 pb-[var(--safe-bottom)]",
              centered && "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:rounded-card sm:pt-0 sm:pb-0 sm:transition-[transform,opacity]",
              shown
                ? cn("translate-y-0", centered && "sm:-translate-x-1/2 sm:-translate-y-1/2 sm:opacity-100")
                : cn("translate-y-full", centered && "sm:-translate-x-1/2 sm:-translate-y-[46%] sm:opacity-0")
            ),
          side === "right" &&
            cn(
              "inset-y-0 right-0 h-full w-full",
              size === "lg" ? "max-w-2xl" : "max-w-sm",
              shown ? "translate-x-0" : "translate-x-full"
            )
        )}
      >
        {side === "bottom" && (
          <div className={cn("mx-auto mb-1 h-1.5 w-10 shrink-0 rounded-full bg-border", centered && "sm:hidden")} aria-hidden />
        )}
        {title && (
          <div className="flex items-center justify-between px-5 py-3">
            <h2 className="font-display text-lg font-semibold">{title}</h2>
            <IconButton variant="ghost" size={32} aria-label="Cerrar" onClick={onClose}>
              <X className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>
        )}
        <div className={cn("min-h-0 overflow-y-auto px-5", side === "right" && "flex-1", footer ? "pb-4" : "pb-6")}>{children}</div>
        {footer && <div className="shrink-0 border-t border-border bg-surface px-5 pb-3 pt-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
