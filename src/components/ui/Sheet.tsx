"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";
import { IconButton } from "./IconButton";

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  /** "bottom": drawer mobile-first (usado también para el panel de filtros). */
  side?: "bottom" | "right";
};

const EXIT_MS = 200;

/**
 * Drawer accesible: se desmonta EXIT_MS después de cerrar para poder animar
 * la salida (más rápida que la entrada — ver .impeccable.md / emil-design-eng).
 */
export function Sheet({ open, onClose, children, title, side = "bottom" }: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  const panelRef = useRef<HTMLDivElement>(null);

  // Patrón "ajustar estado durante el render" (react.dev/learn/you-might-not-need-an-effect):
  // solo useState, sin refs — monta/oculta en la misma pasada en la que
  // cambia `open`, para que el efecto de abajo solo dispare callbacks
  // (rAF/timeout), nunca setState síncrono en su cuerpo.
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setMounted(true);
    else setShown(false);
  }

  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }
    const t = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
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
              "inset-x-0 bottom-0 max-h-[85vh] rounded-t-card pt-2 pb-[env(safe-area-inset-bottom)]",
              shown ? "translate-y-0" : "translate-y-full"
            ),
          side === "right" &&
            cn(
              "inset-y-0 right-0 h-full w-full max-w-sm",
              shown ? "translate-x-0" : "translate-x-full"
            )
        )}
      >
        {side === "bottom" && (
          <div className="mx-auto mb-1 h-1.5 w-10 shrink-0 rounded-full bg-border" aria-hidden />
        )}
        {title && (
          <div className="flex items-center justify-between px-5 py-3">
            <h2 className="font-display text-lg font-semibold">{title}</h2>
            <IconButton variant="ghost" size={32} aria-label="Cerrar" onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </div>
        )}
        <div className="overflow-y-auto px-5 pb-6">{children}</div>
      </div>
    </div>,
    document.body
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
      <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
