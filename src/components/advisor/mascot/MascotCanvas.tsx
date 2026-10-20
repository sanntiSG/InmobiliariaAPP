"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { AdvisorFraming, AdvisorRoles, ClipInfo } from "@/lib/advisor/config";
import { cn } from "@/lib/utils/cn";
import { createMascot, type MascotBase, type MascotController } from "./scene";
import { MascotFallback } from "./MascotFallback";

export type MascotHandle = {
  capture(size?: number): Promise<Blob | null>;
  playClip(name: string): void;
};

type Props = {
  modelUrl: string;
  roles: AdvisorRoles;
  disabled: string[];
  framing: AdvisorFraming;
  /** `talking` mientras se escribe la respuesta; `idle` el resto del tiempo. */
  base: MascotBase;
  /** Se incrementa cada vez que hay que mostrar sorpresa (un hallazgo fuera de lo común). */
  surpriseKey?: number;
  paused?: boolean;
  /** Sólo el estudio del admin: previsualiza animaciones aunque el sistema pida movimiento reducido. */
  forceMotion?: boolean;
  poster?: string | null;
  className?: string;
  onClips?: (clips: ClipInfo[]) => void;
  onStatus?: (status: "loading" | "ready" | "error") => void;
  handleRef?: Ref<MascotHandle>;
};

/**
 * El asesor en 3D. Se carga SÓLO cuando se abre el escenario (ver `MascotCanvasLazy`): three.js y el
 * GLB pesan, y la mayoría de las páginas nunca lo necesitan. Mientras carga muestra el póster (o el
 * orbe); si el navegador no tiene WebGL o el archivo falla, queda el orbe y la app sigue andando.
 */
export function MascotCanvas({
  modelUrl,
  roles,
  disabled,
  framing,
  base,
  surpriseKey = 0,
  paused = false,
  forceMotion,
  poster,
  className,
  onClips,
  onStatus,
  handleRef,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<MascotController | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // Lo último que pidió el padre: se aplica apenas la escena está lista y en cada cambio posterior.
  const latest = useRef({ roles, disabled, framing, base, paused });
  const callbacks = useRef({ onClips, onStatus });
  useEffect(() => {
    latest.current = { roles, disabled, framing, base, paused };
    callbacks.current = { onClips, onStatus };
  });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    let created: MascotController | null = null;
    setStatus("loading");
    callbacks.current.onStatus?.("loading");

    createMascot(el, { url: modelUrl, roles: latest.current.roles, disabled: latest.current.disabled, framing: latest.current.framing, forceMotion })
      .then((c) => {
        if (cancelled) {
          c.dispose();
          return;
        }
        created = c;
        controller.current = c;
        c.setRoles(latest.current.roles, latest.current.disabled);
        c.setFraming(latest.current.framing);
        c.setBase(latest.current.base);
        c.setPaused(latest.current.paused);
        setStatus("ready");
        callbacks.current.onStatus?.("ready");
        callbacks.current.onClips?.(c.clips);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("Asesor 3D no disponible:", err instanceof Error ? err.message : err);
        setStatus("error");
        callbacks.current.onStatus?.("error");
      });

    return () => {
      cancelled = true;
      controller.current = null;
      created?.dispose();
    };
  }, [modelUrl, forceMotion]);

  useEffect(() => controller.current?.setBase(base), [base]);
  useEffect(() => controller.current?.setRoles(roles, disabled), [roles, disabled]);
  useEffect(() => controller.current?.setFraming(framing), [framing]);
  useEffect(() => controller.current?.setPaused(paused), [paused]);
  useEffect(() => {
    if (surpriseKey > 0) controller.current?.surprise();
  }, [surpriseKey]);

  useImperativeHandle(
    handleRef,
    () => ({
      capture: (size) => controller.current?.capture(size) ?? Promise.resolve(null),
      playClip: (name) => controller.current?.playClip(name),
    }),
    []
  );

  return (
    <div className={cn("advisor-mascot", className)} data-status={status}>
      <div ref={host} className="advisor-mascot-host" />
      {status !== "ready" && <MascotFallback poster={poster ?? null} calm={status === "error"} />}
    </div>
  );
}
