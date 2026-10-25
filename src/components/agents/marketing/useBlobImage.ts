"use client";

import { useEffect, useState } from "react";

type Loaded = { src: string; url: string | null; blob: Blob | null; failed: boolean };

/**
 * Baja una imagen UNA sola vez como archivo en memoria: la misma descarga sirve para mostrarla, descargarla y compartirla,
 * sin pedirle al servidor que la dibuje otra vez (las publicaciones se dibujan al vuelo, no se guardan). `status` pasa a
 * "ready" recién cuando la imagen llegó entera: es el momento en que termina la animación de "preparando".
 */
export function useBlobImage(src: string | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!src) return;
    const ctrl = new AbortController();
    let objectUrl: string | null = null;
    fetch(src, { credentials: "same-origin", signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ src, url: objectUrl, blob, failed: false });
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setLoaded({ src, url: null, blob: null, failed: true });
      });
    return () => {
      ctrl.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  const current = src && loaded?.src === src ? loaded : null;
  const status: "idle" | "loading" | "ready" | "error" = !src ? "idle" : !current ? "loading" : current.failed ? "error" : "ready";
  return { url: current?.url ?? null, blob: current?.blob ?? null, status };
}
