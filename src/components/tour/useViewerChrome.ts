"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import type { Viewer } from "@photo-sphere-viewer/core";
import type { GyroscopePlugin } from "@photo-sphere-viewer/gyroscope-plugin";

/**
 * Pantalla completa + modo inmersivo (giroscopio) para el visor del
 * recorrido. Misma lógica que `Photo360Viewer`, extraída como hook para no
 * duplicar el JSX de los botones.
 */
export function useViewerChrome({
  wrapperRef,
  viewerRef,
  gyroRef,
  ready,
}: {
  wrapperRef: RefObject<HTMLDivElement | null>;
  viewerRef: RefObject<Viewer | null>;
  gyroRef: RefObject<GyroscopePlugin | null>;
  /** El viewer ya existe (para confirmar el soporte real del sensor). */
  ready: boolean;
}) {
  const [canImmerse, setCanImmerse] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  // Gate "sólo mobile" por capacidad (sensor), no por breakpoint.
  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
    if (coarse && typeof DeviceOrientationEvent !== "undefined") {
      Promise.resolve().then(() => setCanImmerse(true));
    }
  }, []);

  useEffect(() => {
    const plugin = gyroRef.current;
    if (!ready || !plugin) return;
    const onUpdate = (e: { gyroscopeEnabled: boolean }) => setImmersive(e.gyroscopeEnabled);
    plugin.addEventListener("gyroscope-updated", onUpdate);
    void plugin.isSupported().then((ok) => {
      if (!ok) setCanImmerse(false);
    });
    return () => plugin.removeEventListener("gyroscope-updated", onUpdate);
  }, [ready, gyroRef]);

  const deactivate = useCallback(() => {
    gyroRef.current?.stop();
    setImmersive(false);
  }, [gyroRef]);

  const activate = useCallback(async () => {
    const request = (
      DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<"granted" | "denied"> }
    ).requestPermission?.();
    try {
      if ((await request) === "denied") {
        setHint("Permiso denegado para usar el sensor de tu dispositivo.");
        return;
      }
      await gyroRef.current?.start();
      setImmersive(true);
      setHint("Movés el teléfono y la vista te sigue.");
    } catch {
      setHint("No pudimos activar el sensor de tu dispositivo.");
    }
  }, [gyroRef]);

  const toggleFullscreen = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    if (document.fullscreenEnabled && !document.fullscreenElement) {
      void el.requestFullscreen().catch(() => {});
      return;
    }
    // iOS Safari (sin Fullscreen API en elementos): modo "maximizado" por CSS.
    setIsMaximized((m) => !m);
    setTimeout(() => viewerRef.current?.autoSize(), 50);
  }, [wrapperRef, viewerRef]);

  useEffect(() => {
    function onChange() {
      setIsMaximized(document.fullscreenElement === wrapperRef.current);
      viewerRef.current?.autoSize();
      requestAnimationFrame(() => viewerRef.current?.autoSize());
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [wrapperRef, viewerRef]);

  // Pantalla bloqueada / app en segundo plano: apagar el sensor.
  useEffect(() => {
    function onVisibility() {
      if (document.hidden) deactivate();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [deactivate]);

  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(null), 3000);
    return () => window.clearTimeout(t);
  }, [hint]);

  return { canImmerse, immersive, isMaximized, hint, setHint, activate, deactivate, toggleFullscreen };
}
