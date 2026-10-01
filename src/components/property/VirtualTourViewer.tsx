"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Compass, Home, Maximize, Minimize, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useTourViewer, type SpherePosition } from "@/components/tour/useTourViewer";
import { useViewerChrome } from "@/components/tour/useViewerChrome";
import { sceneName, type TourScene } from "@/components/tour/tour-types";

const btn = cn(
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-pill px-3.5 text-xs font-medium",
  "backdrop-blur shadow-pop transition-[transform,background-color,box-shadow] duration-150",
  "[transition-timing-function:var(--ease-out)] active:scale-[0.97]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
);

type Step = { sceneId: string; position: SpherePosition };

/**
 * Recorrido 360° navegable: cada foto 360° tiene marcadores anclados que
 * llevan a otra foto, mirando hacia la dirección que configuró la
 * inmobiliaria. Se carga con `next/dynamic({ ssr: false })`.
 */
export function VirtualTourViewer({ scenes, startId }: { scenes: TourScene[]; startId?: string }) {
  const firstId = scenes.find((s) => s.id === startId)?.id ?? scenes[0]?.id ?? "";
  const [sceneId, setSceneId] = useState(firstId);
  const [entry, setEntry] = useState<SpherePosition | undefined>(undefined);
  const [history, setHistory] = useState<Step[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (targetId: string, arrival: SpherePosition) => {
      setEntry(arrival);
      setSceneId(targetId);
    },
    []
  );

  const { containerRef, viewerRef, gyroRef, shownSceneId, loadError } = useTourViewer({
    scenes,
    sceneId,
    entry,
    gyroscope: true,
    onLinkSelect: (link) => {
      setHistory((h) => [...h, { sceneId, position: { yaw: link.yaw, pitch: link.pitch } }]);
      go(link.targetId, { yaw: link.arrivalYaw, pitch: link.arrivalPitch });
    },
  });

  const chrome = useViewerChrome({ wrapperRef, viewerRef, gyroRef, ready: shownSceneId !== null });

  // Pista inicial, una sola vez.
  const hintedRef = useRef(false);
  const { setHint } = chrome;
  useEffect(() => {
    if (shownSceneId && !hintedRef.current) {
      hintedRef.current = true;
      setHint("Tocá los marcadores para moverte por la casa.");
    }
  }, [shownSceneId, setHint]);

  const current = scenes.find((s) => s.id === sceneId);
  const currentIndex = scenes.findIndex((s) => s.id === sceneId);

  function goBack() {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    go(prev.sceneId, prev.position);
  }

  function goHome() {
    setHistory([]);
    go(firstId, { yaw: 0, pitch: 0 });
  }

  if (!current) return null;

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-2 px-4 text-center text-sm text-text-muted">
        No se pudo cargar la foto 360°.
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className={cn("relative h-full w-full bg-surface-2", chrome.isMaximized && "fixed inset-0 z-50 h-[100dvh] w-screen")}
    >
      <div ref={containerRef} className="h-full w-full" />

      {shownSceneId === null && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface-2/60 text-sm text-text-muted">
          Cargando foto 360°…
        </div>
      )}

      <div className="absolute left-3 top-3 z-10 flex max-w-[60%] items-center gap-2">
        {history.length > 0 && (
          <button type="button" onClick={goBack} aria-label="Volver a la foto anterior" className={cn(btn, "bg-surface/85 text-text hover:bg-surface")}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
        <span className="truncate rounded-pill bg-surface/85 px-3.5 py-2.5 text-xs font-semibold text-text shadow-pop backdrop-blur">
          {sceneName(current, currentIndex)}
        </span>
      </div>

      <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
        {sceneId !== firstId && (
          <button type="button" onClick={goHome} aria-label="Volver al inicio del recorrido" className={cn(btn, "bg-surface/85 text-text hover:bg-surface")}>
            <Home className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
        {chrome.canImmerse && (
          <button
            type="button"
            onClick={chrome.immersive ? chrome.deactivate : chrome.activate}
            aria-pressed={chrome.immersive}
            className={cn(btn, "px-4", chrome.immersive ? "bg-accent text-accent-contrast" : "bg-surface/85 text-text hover:bg-surface")}
          >
            {chrome.immersive ? <X className="h-3.5 w-3.5" aria-hidden /> : <Compass className="h-3.5 w-3.5" aria-hidden />}
            Modo inmersivo
          </button>
        )}
        <button
          type="button"
          onClick={chrome.toggleFullscreen}
          aria-label={chrome.isMaximized ? "Salir de pantalla completa" : "Maximizar"}
          className={cn(btn, chrome.isMaximized ? "bg-accent text-accent-contrast" : "bg-surface/85 text-text hover:bg-surface")}
        >
          {chrome.isMaximized ? <Minimize className="h-3.5 w-3.5" aria-hidden /> : <Maximize className="h-3.5 w-3.5" aria-hidden />}
        </button>
      </div>

      {chrome.hint && (
        <div
          role="status"
          className="pointer-events-none absolute inset-x-0 bottom-14 z-10 mx-auto w-fit max-w-[85%] rounded-pill bg-surface/90 px-3.5 py-1.5 text-center text-xs font-medium text-text shadow-pop backdrop-blur"
        >
          {chrome.hint}
        </div>
      )}
    </div>
  );
}
