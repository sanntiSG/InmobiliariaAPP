"use client";

import { useMemo, useState } from "react";
import { Crosshair } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { useTourViewer, type SpherePosition } from "@/components/tour/useTourViewer";
import type { TourLink, TourScene } from "@/components/tour/tour-types";

export type ReturnMarker = SpherePosition & { label: string; /** Hacia dónde mira la cámara al volver al origen. */ arrival: SpherePosition };
export type AlignResult = { arrival: SpherePosition; back: ReturnMarker | null };

/**
 * Ventana de configuración de la foto destino. Dos pasos sobre el mismo visor:
 *
 * 1. **Vista de llegada**: se gira la esfera hasta que mire hacia donde
 *    miraba la foto de origen (ej: hacia la puerta por la que se entró).
 * 2. **Marcador de regreso** (sólo al crear): se toca dónde va el marcador
 *    que lleva de vuelta a la foto de origen.
 * 3. **Vista al volver** (sólo si se ubicó el regreso): se gira la foto de
 *    origen hasta que mire hacia donde corresponde al regresar (por defecto,
 *    hacia el marcador por el que se salió).
 *
 * En mobile ocupa toda la pantalla.
 */
export function ArrivalAligner({
  target,
  origin,
  originMarker,
  fromLabel,
  initial,
  askReturn,
  existingReturn,
  onConfirm,
  onCancel,
}: {
  target: TourScene;
  /** Foto de origen — se muestra en el paso 3. */
  origin: TourScene;
  /** Posición del marcador nuevo en la foto de origen (vista sugerida al volver). */
  originMarker: SpherePosition;
  fromLabel: string;
  initial?: SpherePosition;
  /** Pedir también la ubicación del marcador de regreso (al crear un marcador). */
  askReturn: boolean;
  /** Ya existe un marcador en el destino que vuelve al origen. */
  existingReturn?: TourLink;
  onConfirm: (result: AlignResult) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<"arrival" | "return" | "back">("arrival");
  const [arrival, setArrival] = useState<SpherePosition | null>(null);
  const [returnPos, setReturnPos] = useState<SpherePosition | null>(
    existingReturn ? { yaw: existingReturn.yaw, pitch: existingReturn.pitch } : null
  );
  const [returnLabel, setReturnLabel] = useState(existingReturn?.label || fromLabel);
  const [backArrival, setBackArrival] = useState<SpherePosition | null>(null);

  // Escena sin marcadores: acá sólo se elige hacia dónde mirar y dónde va el regreso.
  const scenes = useMemo(
    () => [
      { ...target, links: [] },
      { ...origin, links: [] },
    ],
    [target, origin]
  );
  const sceneId = step === "back" ? origin.id : target.id;
  const { containerRef, getPosition, shownSceneId } = useTourViewer({
    scenes,
    sceneId,
    // Cada paso arranca mirando donde corresponde; el paso 3 sugiere el marcador original.
    entry: step === "back" ? (backArrival ?? originMarker) : step === "return" ? (arrival ?? initial) : initial,
    ghost: step === "return" && returnPos ? { ...returnPos, label: returnLabel } : null,
    onSphereClick: (pos) => {
      if (step === "return") setReturnPos(pos);
    },
  });

  function finish(backView: SpherePosition) {
    setBackArrival(backView);
    if (arrival && returnPos) {
      onConfirm({
        arrival,
        back: { ...returnPos, label: returnLabel.trim() || fromLabel, arrival: backView },
      });
    }
  }

  const totalSteps = askReturn ? (returnPos ? 3 : 2) : 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Configurar la foto de destino"
      className="fixed inset-0 z-[70] flex flex-col bg-bg sm:items-center sm:justify-center sm:bg-black/50 sm:p-6"
    >
      <div className="flex min-h-0 flex-1 flex-col bg-bg sm:max-h-[90dvh] sm:w-full sm:max-w-3xl sm:flex-none sm:overflow-hidden sm:rounded-card sm:shadow-card">
        <div className="px-4 pb-2 pt-4 sm:px-5">
          {askReturn && (
            <p className="text-xs font-medium text-text-muted">Paso {step === "arrival" ? 1 : step === "return" ? 2 : 3} de {totalSteps}</p>
          )}
          {step === "arrival" ? (
            <>
              <h3 className="font-display text-base font-semibold text-text">
                Alineá la vista de llegada a &quot;{target.label || "esta foto"}&quot;
              </h3>
              <p className="mt-1 text-sm text-text-muted">
                Girá la foto hasta que mire hacia donde mirabas en &quot;{fromLabel}&quot; (por ejemplo, hacia la
                puerta por la que entraste). Así, al llegar, el visitante sabe de dónde viene.
              </p>
            </>
          ) : step === "back" ? (
            <>
              <h3 className="font-display text-base font-semibold text-text">Vista al volver a &quot;{origin.label || fromLabel}&quot;</h3>
              <p className="mt-1 text-sm text-text-muted">
                Así se verá &quot;{origin.label || fromLabel}&quot; cuando el visitante vuelva desde &quot;{target.label || "esta foto"}&quot;.
                Giré la foto hasta que mire hacia donde quieras: lo ideal es hacia el marcador por el que se fue, para que sepa de dónde viene.
              </p>
            </>
          ) : (
            <>
              <h3 className="font-display text-base font-semibold text-text">Ubicá el marcador para volver</h3>
              <p className="mt-1 text-sm text-text-muted">
                {existingReturn
                  ? `Ya existe un marcador para volver a "${fromLabel}": tocá la foto para moverlo, o dejalo como está.`
                  : `Tocá en la foto el lugar donde va el marcador que vuelve a "${fromLabel}" (la puerta, la escalera…).`}
              </p>
            </>
          )}
        </div>

        <div className="relative min-h-[40dvh] flex-1 bg-surface-2 sm:aspect-[16/10] sm:flex-none">
          <div ref={containerRef} className="absolute inset-0" />
          {shownSceneId && step !== "return" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-white drop-shadow">
              <Crosshair className="h-8 w-8" aria-hidden />
            </div>
          )}
        </div>

        {step === "return" && returnPos && (
          <div className="px-4 pt-3 sm:px-5">
            <FormField
              label="Título del marcador de regreso"
              maxLength={40}
              value={returnLabel}
              onChange={(e) => setReturnLabel(e.target.value)}
            />
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-3 border-t border-border p-4 sm:px-5">
          {step === "arrival" ? (
            <>
              <Button type="button" variant="secondary" onClick={onCancel}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={!shownSceneId}
                onClick={() => {
                  const pos = getPosition();
                  if (askReturn) {
                    setArrival(pos);
                    setStep("return");
                  } else {
                    onConfirm({ arrival: pos, back: null });
                  }
                }}
              >
                {askReturn ? "Siguiente" : "Confirmar vista"}
              </Button>
            </>
          ) : step === "return" ? (
            <>
              <Button type="button" variant="secondary" onClick={() => setStep("arrival")}>
                Atrás
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => arrival && onConfirm({ arrival, back: null })}
              >
                Sin marcador de regreso
              </Button>
              <Button type="button" disabled={!returnPos} onClick={() => setStep("back")}>
                Siguiente
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={() => setStep("return")}>
                Atrás
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => finish(originMarker)}
              >
                Usar la sugerida
              </Button>
              <Button type="button" disabled={!shownSceneId} onClick={() => finish(getPosition())}>
                Confirmar vista
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
