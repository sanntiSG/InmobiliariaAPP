"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";

export type InfoDialogProps = {
  open: boolean;
  title: string;
  /** Ícono dentro del círculo de acento de arriba. */
  icon: ReactNode;
  children: ReactNode;
  /** Botones del pie (los arma quien lo usa: acá no hay una acción "principal" fija). */
  actions: ReactNode;
  /** Esc o clic afuera. */
  onClose: () => void;
  /**
   * "page" (por defecto): sobre el contenido de la página. "overlay": también por encima del escenario de los agentes
   * (que ocupa toda la pantalla), para abrir un detalle sin cerrarlo.
   */
  layer?: "page" | "overlay";
};

const EXIT_MS = 160;

/**
 * Cartel informativo centrado (no destructivo): explica algo y ofrece dos o tres caminos. Misma mecánica que
 * `ConfirmDialog` — entra con fade + escala corta desde 0.96 (nunca desde 0), sale más rápido, el origen queda en el
 * centro por ser modal, y los setState viven en callbacks (rAF/timeout). Esc y clic afuera lo cierran.
 */
export function InfoDialog({ open, title, icon, children, actions, onClose, layer = "page" }: InfoDialogProps) {
  const [shown, setShown] = useState(false);
  const [lingering, setLingering] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeHandler = useRef(onClose);
  const mounted = open || lingering;

  useEffect(() => {
    closeHandler.current = onClose;
  });

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
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (layer === "overlay") e.preventDefault();
      closeHandler.current();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // El foco entra al cartel (lo anuncia el lector de pantalla); con Tab se llega a las acciones.
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, layer]);

  if (!mounted) return null;

  return createPortal(
    <div className={cn("fixed inset-0 flex items-center justify-center p-4", layer === "overlay" ? "z-[80]" : "z-[60]")}>
      <div
        className={cn(
          "absolute inset-0 bg-black/45 transition-opacity duration-150 [transition-timing-function:var(--ease-out)]",
          shown ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-card bg-surface p-6 shadow-float outline-none",
          "transition-[opacity,transform] duration-200 [transition-timing-function:var(--ease-out)] motion-reduce:transition-none",
          shown ? "scale-100 opacity-100" : "scale-[0.96] opacity-0"
        )}
      >
        <div className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent">{icon}</div>
        <h2 className="mt-4 font-display text-xl font-semibold text-text">{title}</h2>
        <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-text-muted">{children}</div>
        <div className="mt-6 flex flex-col gap-2">{actions}</div>
      </div>
    </div>,
    document.body
  );
}
