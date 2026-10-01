"use client";

import { useMemo } from "react";
import { Crosshair } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useTourViewer, type SpherePosition } from "@/components/tour/useTourViewer";
import type { TourScene } from "@/components/tour/tour-types";

/**
 * Ventana para fijar hacia dónde mira la cámara al llegar a una foto. La
 * persona gira la esfera hasta que coincida con la vista de la que viene
 * y confirma — se guarda la posición actual de la cámara.
 *
 * En mobile ocupa toda la pantalla (bottom sheet a pantalla completa).
 */
export function ArrivalAligner({
  target,
  fromLabel,
  initial,
  onConfirm,
  onCancel,
}: {
  target: TourScene;
  fromLabel: string;
  initial?: SpherePosition;
  onConfirm: (pos: SpherePosition) => void;
  onCancel: () => void;
}) {
  // Escena sin marcadores: acá sólo se elige hacia dónde mirar.
  const scenes = useMemo(() => [{ ...target, links: [] }], [target]);
  const { containerRef, getPosition, shownSceneId } = useTourViewer({
    scenes,
    sceneId: target.id,
    entry: initial,
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Alinear la vista de llegada"
      className="fixed inset-0 z-[70] flex flex-col bg-bg sm:items-center sm:justify-center sm:bg-black/50 sm:p-6"
    >
      <div className="flex min-h-0 flex-1 flex-col bg-bg sm:max-h-[85dvh] sm:w-full sm:max-w-3xl sm:flex-none sm:overflow-hidden sm:rounded-card sm:shadow-card">
        <div className="px-4 pb-2 pt-4 sm:px-5">
          <h3 className="font-display text-base font-semibold text-text">
            Alineá la vista de llegada a &quot;{target.label || "esta foto"}&quot;
          </h3>
          <p className="mt-1 text-sm text-text-muted">
            Girá la foto hasta que mire hacia donde mirabas en &quot;{fromLabel}&quot; (por ejemplo, hacia la puerta
            por la que entraste). Así, al llegar, el visitante sabe de dónde viene.
          </p>
        </div>

        <div className="relative min-h-[40dvh] flex-1 bg-surface-2 sm:aspect-[16/10] sm:flex-none">
          <div ref={containerRef} className="absolute inset-0" />
          {shownSceneId && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-white drop-shadow">
              <Crosshair className="h-8 w-8" aria-hidden />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-border p-4 sm:px-5">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => onConfirm(getPosition())} disabled={!shownSceneId}>
            Confirmar vista
          </Button>
        </div>
      </div>
    </div>
  );
}
