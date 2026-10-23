"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createAmbientPlayer, type AmbientManifest, type AmbientPlayer } from "@/vendor/ambient";
import "@/vendor/ambient/ambient.css";
import { FilterPill } from "@/components/ui/FilterPill";
import { resolveStartState } from "@/lib/ambient/start-state";
import { AmbientStateIcon } from "./ambient-icons";

export type AmbientCoverProps = {
  manifest: AmbientManifest;
  /** Carpeta de archivos, con `/` final y sin versión. */
  baseUrl: string;
  /** Ids de los estados activos (los demás ni se descargan). */
  states: string[];
  /** `"auto"` = según la hora de quien mira, o el id de un estado. */
  start: string;
  title: string;
  className?: string;
};

/**
 * Portada viva: la foto de la propiedad en varios estados (día, atardecer, noche, lluvia, viento) que cambian con una
 * transición, con el clima animado en vivo (WebGL2; sin WebGL2 el reproductor cae a un fundido entre imágenes).
 *
 * El reproductor (`src/vendor/ambient`) dibuja sólo la escena y el aviso "Ambientación digital" (obligatorio); los
 * botones son nuestros (`controls: false`) para que se vean como el resto del sitio. Se monta sólo cuando la pestaña
 * está abierta y se destruye al salir: un único canvas WebGL por pantalla, que además se pausa fuera de vista.
 *
 * Para cambiar `states`/`start` en caliente (vista previa del panel) se remonta con `key` desde afuera.
 */
export function AmbientCover({ manifest, baseUrl, states, start, title, className }: AmbientCoverProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<AmbientPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);

  const active = useMemo(() => manifest.states.filter((s) => states.includes(s.id)), [manifest, states]);
  const activeKey = active.map((s) => s.id).join(",");

  useEffect(() => {
    const host = hostRef.current;
    if (!host || active.length === 0) return;
    // La hora se toma acá (cliente, ya montado): el servidor no sabe en qué momento del día mira cada persona.
    const initial = resolveStartState(active.map((s) => s.id), start);
    const player = createAmbientPlayer(host, {
      manifest: { ...manifest, title, initialState: initial, states: active },
      // No se pide: sólo sirve de base para resolver los nombres de archivo.
      manifestUrl: `${baseUrl}experience.json`,
      controls: false,
      initialState: initial,
      onReady: () => setCurrent(initial),
      onStateChange: (id) => setCurrent(id),
    });
    playerRef.current = player;
    player.ready.then(() => setReady(true), () => {});
    return () => {
      playerRef.current = null;
      player.destroy();
    };
    // `active` depende de manifest + states; se compara por contenido (`activeKey`) para no remontar por cambios de identidad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, baseUrl, activeKey, start, title]);

  async function choose(id: string) {
    const player = playerRef.current;
    if (!player || id === current) return;
    setCurrent(id);
    const ok = await player.setState(id).catch(() => false);
    if (!ok) setCurrent(player.getState());
  }

  return (
    <div className={className}>
      <div className="rounded-card bg-surface-2 shadow-card [--ambient-accent-fg:var(--color-accent-contrast)] [--ambient-accent:var(--color-accent)] [--ambient-bg:var(--color-surface-2)] [--ambient-radius:var(--radius-card)] [--ambient-ratio:16_/_10]">
        <div ref={hostRef} />
      </div>

      {active.length > 1 && (
        <div
          role="group"
          aria-label="Clima y horario"
          className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {active.map((s) => (
            <FilterPill key={s.id} type="button" active={current === s.id} disabled={!ready} onClick={() => choose(s.id)}>
              <AmbientStateIcon id={s.id} />
              {s.label}
            </FilterPill>
          ))}
        </div>
      )}
    </div>
  );
}
