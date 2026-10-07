"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "./Button";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

const EXIT_MS = 160;

/**
 * Cartel de alerta centrado para acciones destructivas. Entra con un fade +
 * escala corta (desde 0.96, nunca desde 0) y sale más rápido; los modales
 * mantienen el origen en el centro. Esc y clic afuera cancelan, salvo mientras
 * `busy` (no se puede cerrar a mitad de la acción). Los setState viven en
 * callbacks (rAF/timeout), igual que `Sheet`.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Eliminar",
  cancelLabel = "Cancelar",
  busy = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [shown, setShown] = useState(false);
  const [lingering, setLingering] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const cancelHandler = useRef(onCancel);
  const busyRef = useRef(busy);
  const mounted = open || lingering;

  useEffect(() => {
    cancelHandler.current = onCancel;
    busyRef.current = busy;
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
      if (e.key === "Escape" && !busyRef.current) cancelHandler.current();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Foco en "Cancelar": la opción segura es la que queda a mano.
    cancelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className={cn(
          "absolute inset-0 bg-black/45 transition-opacity duration-150 [transition-timing-function:var(--ease-out)]",
          shown ? "opacity-100" : "opacity-0"
        )}
        onClick={() => !busy && onCancel()}
        aria-hidden
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative w-full max-w-sm rounded-card bg-surface p-6 shadow-float",
          "transition-[opacity,transform] duration-200 [transition-timing-function:var(--ease-out)] motion-reduce:transition-none",
          shown ? "scale-100 opacity-100" : "scale-[0.96] opacity-0"
        )}
      >
        <div className="flex size-10 items-center justify-center rounded-full bg-danger-soft text-danger">
          <TriangleAlert className="h-5 w-5" aria-hidden />
        </div>
        <h2 className="mt-4 font-display text-lg font-semibold text-text">{title}</h2>
        {children && <div className="mt-2 flex flex-col gap-2 text-sm text-text-muted">{children}</div>}

        {error && (
          <p className="mt-3 rounded-media bg-danger-soft p-3 text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? "Eliminando…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
