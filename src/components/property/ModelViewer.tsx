"use client";

import { useEffect, useState } from "react";

/**
 * Envuelve <model-viewer> (@google/model-viewer). El paquete define el
 * custom element llamando a `customElements.define(...)` al cargarse, algo
 * que no existe en Node — por eso el import se difiere a un efecto (nunca
 * corre en SSR) en vez de importarse arriba del archivo. El propio tag
 * <model-viewer> no rompe nada en el HTML de servidor: un custom element
 * sin definir se renderiza como un elemento genérico hasta que se registra.
 */
export function ModelViewer({ src, alt, poster }: { src: string; alt: string; poster?: string }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    import("@google/model-viewer").then(() => setReady(true));
  }, []);

  return (
    <div className="relative h-full w-full">
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-2 text-sm text-text-muted">
          Cargando visor 3D…
        </div>
      )}
      <model-viewer
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
        style={{ width: "100%", height: "100%", backgroundColor: "var(--surface-2)", display: ready ? "block" : "none" }}
      />
    </div>
  );
}
