"use client";

import type { ReactNode, RefObject } from "react";
import { StreamedText } from "@/components/advisor/StreamedText";
import { useStage } from "@/components/advisor/StageFrame";

/** Lo que el agente ya "dijo" en esta sesión: al reabrir el escenario no vuelve a escribirlo palabra por palabra. */
const spoken = new Set<string>();

/** Lo que dice el agente, escrito palabra por palabra la primera vez (mientras, la mascota "habla"). */
export function Speech({ text, keepTalking = false }: { text: string; keepTalking?: boolean }) {
  const { setTalking } = useStage();
  return (
    <StreamedText
      key={text}
      text={text}
      fresh={!spoken.has(text)}
      onStart={() => setTalking(true)}
      onEnd={() => {
        spoken.add(text);
        // Mientras trabaja, la mascota sigue "hablando" aunque el texto ya esté completo.
        if (!keepTalking) setTalking(false);
      }}
      className="advisor-lead"
    />
  );
}

/**
 * Marco común de un paso de un agente que no es un chat: lo que dice, el contenido que se desliza (la mascota se achica con
 * el desplazamiento, igual que en la charla del asesor) y una barra de acciones abajo que siempre se ve.
 */
export function Step({
  speech,
  keepTalking,
  children,
  dock,
  thread,
}: {
  speech?: string;
  keepTalking?: boolean;
  children?: ReactNode;
  dock?: ReactNode;
  thread: RefObject<HTMLDivElement | null>;
}) {
  const { userScrolledRef, track } = useStage();
  return (
    <section className="advisor-thread-wrap">
      <div
        ref={thread}
        className="advisor-thread"
        onWheel={() => (userScrolledRef.current = true)}
        onTouchMove={() => (userScrolledRef.current = true)}
        onScroll={(e) => {
          if (userScrolledRef.current) track(e.currentTarget.scrollTop);
        }}
      >
        {speech && (
          <div data-step>
            <Speech text={speech} keepTalking={keepTalking} />
          </div>
        )}
        {children}
      </div>
      {dock && <div className="advisor-dock">{dock}</div>}
    </section>
  );
}

/** La inmobiliaria que el admin viene mirando en el panel (`?agencyId=` de la dirección actual, que cambia sin cambiar de página). */
export function agencyFromLocation(): string | null {
  if (typeof window === "undefined" || !window.location.pathname.startsWith("/dashboard")) return null;
  const id = new URLSearchParams(window.location.search).get("agencyId");
  return id && /^[a-f0-9]{24}$/i.test(id) ? id : null;
}
