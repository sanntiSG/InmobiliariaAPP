"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactPhotoSphereViewer } from "react-photo-sphere-viewer";
import type { Viewer } from "@photo-sphere-viewer/core";
import { GyroscopePlugin } from "@photo-sphere-viewer/gyroscope-plugin";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ArrowUpRight, Compass, X } from "lucide-react";
import "@photo-sphere-viewer/core/index.css";
import { cn } from "@/lib/utils/cn";

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
 *
 * Modo inmersivo (giroscopio): sólo en dispositivos con sensor de
 * orientación (mobile) — nunca en desktop, aunque la ventana sea angosta.
 * Sigue el movimiento físico del teléfono (levantás el teléfono y mirás el
 * techo), vía `@photo-sphere-viewer/gyroscope-plugin`.
 */
export function Photo360Viewer({ src }: { src: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [canImmerse, setCanImmerse] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const gyroRef = useRef<GyroscopePlugin | null>(null);
  const ownsFullscreenRef = useRef(false);

  // Gate "sólo mobile" por capacidad, no por breakpoint: una tablet ancha en
  // landscape sí tiene sensor, una notebook táctil angosta no. Se muestra
  // optimista acá y se retira si `isSupported()` (§ handleReady) resuelve
  // que no hay sensor real disponible.
  useEffect(() => {
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
    const hasOrientationApi = typeof DeviceOrientationEvent !== "undefined";
    if (coarsePointer && hasOrientationApi) {
      Promise.resolve().then(() => setCanImmerse(true));
    }
  }, []);

  // Array de plugins memoizado: el wrapper mete `props.plugins` en las deps
  // de su propio useMemo de opciones — un array literal nuevo en cada
  // render dispararía una recreación innecesaria del viewer.
  const plugins = useMemo(
    () => [GyroscopePlugin.withConfig({ touchmove: true, roll: true, moveMode: "smooth" as const })],
    []
  );

  const handleReady = useCallback((instance: Viewer) => {
    viewerRef.current = instance;
    const plugin = instance.getPlugin("gyroscope") as unknown as GyroscopePlugin | undefined;
    gyroRef.current = plugin ?? null;
    if (!plugin) return;

    plugin.addEventListener("gyroscope-updated", (e) => setImmersive(e.gyroscopeEnabled));

    // Confirmación asíncrona: en Android `isSupported()` sólo resuelve
    // `true` cuando llegó un evento `deviceorientation` real. Si resuelve
    // `false`, no hay sensor de verdad — se esconde el botón que se había
    // mostrado optimista.
    void plugin.isSupported().then((supported) => {
      if (!supported) setCanImmerse(false);
    });
  }, []);

  /**
   * Apaga el modo inmersivo: para el sensor y sale de pantalla completa si
   * fuimos nosotros quienes la pedimos. Es el único punto de apagado — lo
   * usan el botón, el cambio de recorrido (efecto `[src]` más abajo),
   * `visibilitychange` (el dispositivo se bloquea o la app pasa a segundo
   * plano) y `fullscreenchange` cuando el usuario sale con Escape/gesto del
   * sistema.
   */
  const deactivate = useCallback(() => {
    gyroRef.current?.stop();
    if (ownsFullscreenRef.current) void document.exitFullscreen().catch(() => {});
  }, []);

  const activate = useCallback(async () => {
    // Tanto `requestFullscreen()` como `requestPermission()` (iOS) exigen
    // estar dentro de un gesto del usuario — las dos salen sincrónicamente
    // acá (una función `async` corre sincrónico hasta el primer `await`),
    // antes de encadenar nada.
    if (document.fullscreenEnabled && wrapperRef.current) {
      ownsFullscreenRef.current = true;
      void wrapperRef.current.requestFullscreen().catch(() => {
        ownsFullscreenRef.current = false;
      });
    }

    const requestPermission = (
      DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<"granted" | "denied"> }
    ).requestPermission?.();

    try {
      const permission = await requestPermission;
      if (permission === "denied") {
        setHint("Permiso denegado para usar el sensor de tu dispositivo.");
        if (ownsFullscreenRef.current) void document.exitFullscreen().catch(() => {});
        return;
      }
      await gyroRef.current?.start();
      setHint("Movés el teléfono y la vista te sigue.");
    } catch {
      setHint("No pudimos activar el sensor de tu dispositivo.");
    }
  }, []);

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
      // Se ejecuta tanto al cambiar de `src` (otro recorrido, mismo
      // Photo360Viewer — no remonta) como al desmontar de verdad. En los
      // dos casos hay que tirar abajo el visor actual a mano:
      // react-photo-sphere-viewer no lo destruye solo al desmontar su
      // <ReactPhotoSphereViewer> interno. Sin esto, cambiar de recorrido con
      // el modo inmersivo activo dejaba el listener de `deviceorientation`
      // del visor viejo vivo (filtrado) y el botón marcado "activo"
      // apuntando a una instancia reemplazada — el giroscopio del visor
      // NUEVO nunca se había arrancado.
      deactivate();
      viewerRef.current?.destroy();
      viewerRef.current = null;
      gyroRef.current = null;
      setImmersive(false);
      setHint(null);
    };
  }, [src, deactivate]);

  useEffect(() => {
    function onFullscreenChange() {
      const inFullscreen = document.fullscreenElement === wrapperRef.current;
      if (!inFullscreen) {
        ownsFullscreenRef.current = false;
        // Si el usuario salió de fullscreen con Escape/gesto del sistema,
        // apagamos el sensor también — no tiene sentido seguir consumiéndolo
        // fuera del modo inmersivo.
        gyroRef.current?.stop();
      }
      // PSV necesita recalcular el canvas al nuevo tamaño del contenedor.
      viewerRef.current?.autoSize();
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // El dispositivo se bloquea o la app pasa a segundo plano: apagar el modo
  // inmersivo ahí mismo. No hay que esperar a que el navegador decida (o no)
  // salir de fullscreen por su cuenta — `visibilitychange` es la señal
  // directa, y cubre casos donde el sistema no sale de fullscreen al
  // bloquear la pantalla.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden) deactivate();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [deactivate]);

  // Entrada/salida del hint flotante — mismo idioma que `PropertyPopupCard`
  // (opacity + y + scale, expo.out, guardado por prefers-reduced-motion): sin
  // esto el mensaje aparece/desaparece de golpe, lo que se lee como roto.
  useGSAP(
    () => {
      if (!hint || !hintRef.current) return;
      const el = hintRef.current;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (reduceMotion) {
        const timeout = window.setTimeout(() => setHint(null), 3000);
        return () => window.clearTimeout(timeout);
      }

      gsap.fromTo(el, { opacity: 0, y: -6, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.2, ease: "expo.out" });
      const timeout = window.setTimeout(() => {
        gsap.to(el, {
          opacity: 0,
          y: -6,
          scale: 0.95,
          duration: 0.15,
          ease: "power2.in",
          onComplete: () => setHint(null),
        });
      }, 3000);
      return () => window.clearTimeout(timeout);
    },
    { dependencies: [hint], scope: wrapperRef }
  );

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
    <div ref={wrapperRef} className="relative h-full w-full bg-surface-2">
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-2 text-sm text-text-muted">
          Cargando foto 360°…
        </div>
      )}
      {status === "ready" && (
        // navbar sin "fullscreen" (default de la librería: ["zoom", "fullscreen"])
        // a propósito: el botón de fullscreen propio de PSV pide pantalla
        // completa sobre SU contenedor interno, distinto del `wrapperRef` que
        // usa nuestro "Modo inmersivo" — combinar los dos genera un pedido de
        // fullscreen anidado (uno sobre un descendiente del otro), que el
        // navegador resuelve reemplazando el elemento en fullscreen y deja
        // nuestro propio botón fuera de él (inaccesible) y el giroscopio
        // apagado a mitad de camino. Con un solo control no hay conflicto.
        <ReactPhotoSphereViewer
          src={src}
          height="100%"
          width="100%"
          plugins={plugins}
          navbar={["zoom"]}
          onReady={handleReady}
        />
      )}

      {status === "ready" && canImmerse && (
        <button
          type="button"
          onClick={immersive ? deactivate : activate}
          aria-pressed={immersive}
          className={cn(
            "absolute right-3 top-3 z-10 inline-flex min-h-11 items-center gap-1.5 rounded-pill px-4 text-xs font-medium",
            "backdrop-blur shadow-pop transition-[transform,background-color,box-shadow] duration-150",
            "[transition-timing-function:var(--ease-out)] active:scale-[0.97]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
            immersive ? "bg-accent text-accent-contrast" : "bg-surface/85 text-text"
          )}
        >
          {immersive ? <X className="h-3.5 w-3.5" aria-hidden /> : <Compass className="h-3.5 w-3.5" aria-hidden />}
          Modo inmersivo
        </button>
      )}

      {status === "ready" && hint && (
        <div
          ref={hintRef}
          className="pointer-events-none absolute inset-x-0 top-16 z-10 mx-auto w-fit max-w-[85%] rounded-pill bg-surface/90 px-3.5 py-1.5 text-center text-xs font-medium text-text shadow-pop backdrop-blur"
        >
          {hint}
        </div>
      )}
    </div>
  );
}
