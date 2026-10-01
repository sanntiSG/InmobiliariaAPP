"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Viewer } from "@photo-sphere-viewer/core";
import { MarkersPlugin } from "@photo-sphere-viewer/markers-plugin";
import { GyroscopePlugin } from "@photo-sphere-viewer/gyroscope-plugin";
import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/markers-plugin/index.css";
import type { TourLink, TourScene } from "./tour-types";

export type SpherePosition = { yaw: number; pitch: number };

export type TourViewerOptions = {
  scenes: TourScene[];
  sceneId: string;
  /** Hacia dónde mira la cámara al entrar a `sceneId` (radianes). */
  entry?: SpherePosition;
  /** Click en un marcador (modo público: navegar; editor: seleccionar). */
  onLinkSelect?: (link: TourLink) => void;
  /** Click en un punto libre de la esfera (editor: crear/reubicar marcador). */
  onSphereClick?: (pos: SpherePosition) => void;
  selectedLinkId?: string | null;
  /** Marcador "fantasma" mientras se está creando uno nuevo. */
  ghost?: (SpherePosition & { label: string }) | null;
  /** Habilita el plugin de giroscopio (modo inmersivo en mobile). */
  gyroscope?: boolean;
};

/**
 * Los marcadores se arman con DOM + `textContent` — nunca con `html` — porque
 * el título lo escribe el usuario del dashboard (evita XSS).
 */
function makeMarkerElement(label: string, flags: { selected?: boolean; ghost?: boolean }) {
  const el = document.createElement("div");
  el.className = "tour-marker";
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", label ? `Ir a ${label}` : "Ir a otra foto");
  if (flags.selected) el.dataset.selected = "true";
  if (flags.ghost) el.dataset.ghost = "true";

  const dot = document.createElement("span");
  dot.className = "tour-marker__dot";
  dot.textContent = "↑";
  dot.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.textContent = label || "Sin título";

  el.append(dot, text);
  return el;
}

/**
 * Encapsula un Photo Sphere Viewer + MarkersPlugin que navega entre escenas
 * de un recorrido. Lo usan el visor público y el editor del dashboard.
 *
 * Mismo patrón que `Photo360Viewer`: sólo corre en el cliente (el componente
 * que lo usa se importa con `next/dynamic({ ssr: false })`).
 */
export function useTourViewer(options: TourViewerOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const markersRef = useRef<MarkersPlugin | null>(null);
  const gyroRef = useRef<GyroscopePlugin | null>(null);
  const [shownSceneId, setShownSceneId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const { scenes, sceneId, entry, selectedLinkId, ghost, gyroscope } = options;

  // Callbacks por ref: el viewer se crea una sola vez y no puede quedar con
  // closures viejas.
  const callbacksRef = useRef(options);
  useEffect(() => {
    callbacksRef.current = options;
  });

  const scene = scenes.find((s) => s.id === sceneId);
  const loadedRef = useRef<string | null>(null);

  // Creación única del viewer, con la escena inicial.
  useEffect(() => {
    const container = containerRef.current;
    const initial = scenes.find((s) => s.id === sceneId);
    if (!container || !initial) return;

    const viewer = new Viewer({
      container,
      panorama: initial.photo360Url,
      defaultYaw: entry?.yaw ?? 0,
      defaultPitch: entry?.pitch ?? 0,
      navbar: ["zoom"],
      loadingTxt: "Cargando…",
      plugins: [
        [MarkersPlugin, {}],
        ...(gyroscope
          ? [GyroscopePlugin.withConfig({ touchmove: true, roll: true, moveMode: "smooth" as const })]
          : []),
      ],
    });
    viewerRef.current = viewer;
    loadedRef.current = initial.id;
    markersRef.current = viewer.getPlugin<MarkersPlugin>(MarkersPlugin);
    gyroRef.current = gyroscope ? (viewer.getPlugin("gyroscope") as unknown as GyroscopePlugin) : null;

    viewer.addEventListener("ready", () => setShownSceneId(initial.id), { once: true });
    viewer.addEventListener("panorama-error", () => setLoadError(true));
    viewer.addEventListener("click", (e) => {
      if (e.data.rightclick) return;
      callbacksRef.current.onSphereClick?.({ yaw: e.data.yaw, pitch: e.data.pitch });
    });
    markersRef.current.addEventListener("select-marker", (e) => {
      const sc = callbacksRef.current.scenes.find((s) => s.id === loadedRef.current);
      const link = sc?.links.find((l) => l.id === e.marker.id);
      if (link) callbacksRef.current.onLinkSelect?.(link);
    });

    return () => {
      viewer.destroy();
      viewerRef.current = null;
      markersRef.current = null;
      gyroRef.current = null;
      loadedRef.current = null;
    };
    // Sólo en el montaje: los cambios de escena van por el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cambio de escena: transición con fade (sin transición si prefiere menos movimiento).
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !scene || loadedRef.current === scene.id) return;
    loadedRef.current = scene.id;
    markersRef.current?.clearMarkers();
    Promise.resolve().then(() => setShownSceneId(null));

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    viewer
      .setPanorama(scene.photo360Url, {
        position: entry ?? { yaw: 0, pitch: 0 },
        transition: reduceMotion ? false : { speed: 800, rotation: false },
        showLoader: false,
      })
      .then((completed) => {
        // `false` = una navegación posterior canceló esta.
        if (completed && loadedRef.current === scene.id) setShownSceneId(scene.id);
      })
      .catch(() => {
        /* AbortError al navegar rápido: se ignora. */
      });
  }, [scene, entry]);

  // Marcadores de la escena visible.
  useEffect(() => {
    const markers = markersRef.current;
    if (!markers || !scene || shownSceneId !== scene.id) return;
    const configs = scene.links.map((l) => ({
      id: l.id,
      position: { yaw: l.yaw, pitch: l.pitch },
      element: makeMarkerElement(l.label, { selected: l.id === selectedLinkId }),
      anchor: "center center",
      zIndex: l.id === selectedLinkId ? 3 : 2,
    }));
    if (ghost) {
      configs.push({
        id: "__ghost__",
        position: { yaw: ghost.yaw, pitch: ghost.pitch },
        element: makeMarkerElement(ghost.label, { ghost: true }),
        anchor: "center center",
        zIndex: 4,
      });
    }
    markers.setMarkers(configs);
  }, [scene, shownSceneId, selectedLinkId, ghost]);

  // Precarga de las escenas vecinas — la navegación se siente instantánea.
  useEffect(() => {
    if (!scene || shownSceneId !== scene.id) return;
    for (const l of scene.links) {
      const target = scenes.find((s) => s.id === l.targetId);
      if (target) new Image().src = target.photo360Url;
    }
  }, [scene, scenes, shownSceneId]);

  const getPosition = useCallback((): SpherePosition => {
    const p = viewerRef.current?.getPosition();
    return { yaw: p?.yaw ?? 0, pitch: p?.pitch ?? 0 };
  }, []);

  const rotateTo = useCallback((pos: SpherePosition) => {
    viewerRef.current?.rotate(pos);
  }, []);

  return { containerRef, viewerRef, gyroRef, shownSceneId, loadError, getPosition, rotateTo };
}
