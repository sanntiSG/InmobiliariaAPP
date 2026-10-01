"use client";

import { useEffect } from "react";
import dynamicImport from "next/dynamic";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import type { TourScene } from "@/components/tour/tour-types";

const VirtualTourViewer = dynamicImport(
  () => import("@/components/property/VirtualTourViewer").then((m) => m.VirtualTourViewer),
  { ssr: false }
);

/**
 * Prueba del recorrido tal como lo verá el visitante, con lo que hay en el
 * formulario aunque todavía no esté guardado. Es el mismo visor público.
 * Portal en `document.body`: se monta desde dentro del <form> de la propiedad.
 */
export function TourTestOverlay({
  scenes,
  startId,
  onClose,
  /** Dentro del editor se superpone a su propio contenedor; suelto, cubre la pantalla. */
  inline = false,
}: {
  scenes: TourScene[];
  startId?: string;
  onClose: () => void;
  inline?: boolean;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (inline) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [inline]);

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Probar el recorrido"
      className={inline ? "absolute inset-0 z-30 flex flex-col bg-bg" : "fixed inset-0 z-[80] flex flex-col bg-bg"}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold text-text">Probar recorrido</h3>
          <p className="truncate text-xs text-text-muted">
            Así lo verá el visitante, con lo que tenés ahora (aún sin guardar). Tocá los marcadores para moverte.
          </p>
        </div>
        <Button type="button" size="sm" onClick={onClose}>
          Volver
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <VirtualTourViewer scenes={scenes} startId={startId} />
      </div>
    </div>
  );

  return inline ? content : createPortal(content, document.body);
}
