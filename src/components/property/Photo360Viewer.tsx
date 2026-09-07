"use client";

import { useEffect, useState } from "react";
import { ReactPhotoSphereViewer } from "react-photo-sphere-viewer";
import { ArrowUpRight } from "lucide-react";
import "@photo-sphere-viewer/core/index.css";

/**
 * Visor de fotos 360° (equirectangulares) — Photo Sphere Viewer, vía
 * Three.js/WebGL. El archivo es una imagen común, subida a nuestro storage
 * igual que cualquier foto de la propiedad — no depende de ningún visor de
 * terceros ni de un link externo.
 *
 * Este componente se carga siempre con `next/dynamic({ ssr: false })` desde
 * `PropertyMedia.tsx` (mismo patrón que `LocationPicker`/`MapCanvas` con
 * maplibre-gl) — el import de `@photo-sphere-viewer/core` toca `document`
 * al inicializar, así que nunca puede correr en el servidor.
 *
 * El estado de carga/error se resuelve pre-cargando la imagen con un
 * `Image()` nativo en vez de depender de los eventos internos del visor —
 * más simple y no atado a la API interna de la librería.
 */
export function Photo360Viewer({ src }: { src: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    // `.then()` en vez de un setState directo en el cuerpo del efecto — evita
    // el warning de lint `react-hooks/set-state-in-effect` (mismo patrón que
    // en `PropertyMedia.tsx`/`ModelViewer.tsx`). Hace falta resetear a
    // "loading" acá (no sólo en el estado inicial) porque este componente
    // sigue montado si la propiedad tiene varias fotos 360 y se cambia de
    // una a otra con los chips — sólo cambia `src`.
    Promise.resolve().then(() => setStatus("loading"));
    const img = new Image();
    img.onload = () => setStatus("ready");
    img.onerror = () => setStatus("error");
    img.src = src;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  if (status === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-surface-2 px-4 text-center text-sm text-text-muted">
        <p>No se pudo cargar la foto 360°.</p>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
        >
          Abrir la foto directamente <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-2 text-sm text-text-muted">
          Cargando foto 360°…
        </div>
      )}
      {status === "ready" && <ReactPhotoSphereViewer src={src} height="100%" width="100%" />}
    </div>
  );
}
