"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Envuelve <model-viewer> (@google/model-viewer). El paquete define el
 * custom element llamando a `customElements.define(...)` al cargarse, algo
 * que no existe en Node — por eso el import se difiere a un efecto (nunca
 * corre en SSR) en vez de importarse arriba del archivo. El propio tag
 * <model-viewer> no rompe nada en el HTML de servidor: un custom element
 * sin definir se renderiza como un elemento genérico hasta que se registra.
 */
export function ModelViewer({ src, alt, poster }: { src: string; alt: string; poster?: string }) {
  const [libraryReady, setLibraryReady] = useState(false);
  // "loading": la librería o el modelo todavía están cargando.
  // "ready": el modelo cargó y se puede ver.
  // "error": el modelo dio 404/es inválido — sin esto el usuario se queda
  // viendo "Cargando visor 3D…" para siempre si la URL está rota.
  const [modelState, setModelState] = useState<"loading" | "ready" | "error">("loading");
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    import("@google/model-viewer").then(() => setLibraryReady(true));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!libraryReady || !el) return;
    setModelState("loading");
    const onLoad = () => setModelState("ready");
    const onError = () => setModelState("error");
    el.addEventListener("load", onLoad);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("load", onLoad);
      el.removeEventListener("error", onError);
    };
  }, [libraryReady, src]);

  return (
    <div className="relative h-full w-full">
      {(!libraryReady || modelState === "loading") && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-2 text-sm text-text-muted">
          Cargando visor 3D…
        </div>
      )}
      {libraryReady && modelState === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-2 px-4 text-center text-sm text-text-muted">
          <p>No se pudo cargar el modelo 3D.</p>
          <a href={src} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
            Abrir el archivo directamente ↗
          </a>
        </div>
      )}
      {libraryReady && (
        <model-viewer
          ref={ref}
          src={src}
          alt={alt}
          poster={poster}
          camera-controls
          auto-rotate
          ar
          ar-modes="webxr scene-viewer quick-look"
          shadow-intensity="1"
          loading="eager"
          reveal="auto"
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: "var(--surface-2)",
            display: modelState === "error" ? "none" : "block",
          }}
        />
      )}
    </div>
  );
}
