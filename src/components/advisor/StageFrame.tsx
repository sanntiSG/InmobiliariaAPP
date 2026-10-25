"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { PublicAdvisorConfig } from "@/lib/advisor/public-config";
import { MascotCanvasLazy } from "./mascot/MascotCanvasLazy";
import { closeAdvisor } from "./store";
import { useHeroCollapse } from "./useHeroCollapse";

const EXIT_MS = 300;
const SCROLL_KEYS = new Set(["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "]);
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';

/** Lo que el marco le ofrece al contenido de cada agente (la charla del asesor, los pasos del de marketing, etc.). */
export type StageApi = {
  config: PublicAdvisorConfig;
  /** El escenario terminó de abrirse. */
  shown: boolean;
  /** La mascota "habla" mientras aparece el texto. */
  setTalking: (talking: boolean) => void;
  /** La mascota se sorprende (una vez por llamada). */
  surprise: () => void;
  /** La persona deslizó el contenido a mano: sólo entonces la mascota se achica. */
  userScrolledRef: MutableRefObject<boolean>;
  track: (top: number) => void;
  release: (top: number) => void;
  close: () => void;
};

const StageContext = createContext<StageApi | null>(null);

export function useStage(): StageApi {
  const api = useContext(StageContext);
  if (!api) throw new Error("useStage va dentro de <StageFrame>.");
  return api;
}

type FrameProps = {
  open: boolean;
  origin: { x: number; y: number; w: number; h: number } | null;
  config: PublicAdvisorConfig | null;
  /** Prueba del estudio: la mascota se anima aunque el sistema pida menos movimiento. */
  preview: boolean;
  /** Mientras trabaja ("Analizando", "Preparando"): reemplaza al estado "Listo". */
  busyLabel?: string | null;
  ariaLabel: string;
  /** Botones junto al de cerrar (p. ej. "Charla nueva"). */
  headerActions?: ReactNode;
  children: ReactNode;
};

/**
 * El marco del escenario de cualquier agente: pantalla completa en un portal, apertura con `clip-path` desde el lanzador
 * (CSS, ~460 ms) y cierre más rápido, mascota 3D que se achica al deslizar, foco atrapado, Esc, scroll de la página bloqueado
 * y seguimiento de la pantalla visible del celular (teclado abierto). El contenido va dentro (`children`) y habla con el marco
 * por `useStage()`. Cada agente pone lo suyo: el asesor una conversación, el de marketing pasos guiados, el de correo su bandeja.
 */
export function StageFrame({ open, origin, config, preview, busyLabel, ariaLabel, headerActions, children }: FrameProps) {
  const hasConfig = !!config;

  // Montaje y apertura sólo dentro de rAF/timeouts (nunca setState en el render: eso rompió `Sheet`).
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  // Terminada la apertura se quita el recorte (clip-path); al cerrar se vuelve a poner un cuadro antes de animar.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (open) {
      let r2 = 0;
      const r1 = requestAnimationFrame(() => {
        setMounted(true);
        r2 = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      });
      return () => {
        cancelAnimationFrame(r1);
        cancelAnimationFrame(r2);
      };
    }
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      setSettled(false);
      r2 = requestAnimationFrame(() => setShown(false));
    });
    const t = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      window.clearTimeout(t);
    };
  }, [open]);

  useEffect(() => {
    if (!shown) return;
    const t = window.setTimeout(() => setSettled(true), 520);
    return () => window.clearTimeout(t);
  }, [shown]);

  const root = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  // Mascota: "habla" mientras aparece el texto; sorprendida si la respuesta trae algo fuera de lo común.
  const [talking, setTalking] = useState(false);
  const [surpriseKey, setSurpriseKey] = useState(0);
  const surprise = useCallback(() => setSurpriseKey((k) => k + 1), []);
  // La mascota se achica sólo cuando la PERSONA desliza el contenido, no cuando el escenario baja solo a una respuesta nueva.
  const userScrolledRef = useRef(false);
  const { hero: heroRef, mascot: mascotRef, veil: veilRef, track, release } = useHeroCollapse(mounted && hasConfig);

  // El escenario copia la pantalla VISIBLE (alto y desplazamiento de `visualViewport`) a --vv-h / --vv-top:
  // con el teclado del celular abierto la pantalla visible es más chica y Safari la desplaza, y así el
  // escenario no queda cortado ni deja ver la página de atrás (ver globals.css).
  useLayoutEffect(() => {
    const el = root.current;
    const vv = window.visualViewport;
    if (!mounted || !hasConfig || !el || !vv) return;
    const sync = () => {
      const zoomed = vv.scale > 1.01; // con pellizco de zoom no se sigue a la pantalla visible
      el.style.setProperty("--vv-h", `${zoomed ? window.innerHeight : vv.height}px`);
      el.style.setProperty("--vv-top", `${zoomed ? 0 : vv.offsetTop}px`);
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      el.style.removeProperty("--vv-h");
      el.style.removeProperty("--vv-top");
    };
  }, [mounted, hasConfig]);

  // Foco, scroll bloqueado y foco de vuelta al cerrar.
  useEffect(() => {
    if (!mounted) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const raf = requestAnimationFrame(() => {
      // En el celular no se enfoca el campo solo: abriría el teclado y taparía la mascota.
      if (coarse) root.current?.focus();
      else (document.getElementById("advisor-input") ?? root.current)?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      document.documentElement.style.overflow = prevOverflow;
      returnFocus.current?.focus?.();
    };
  }, [mounted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeAdvisor();
        return;
      }
      // Teclas de scroll fuera de los campos de texto (ahí no deslizan el contenido).
      if (SCROLL_KEYS.has(e.key) && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) userScrolledRef.current = true;
      if (e.key !== "Tab" || !root.current) return;
      const nodes = [...root.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Tocar un enlace interno dentro del escenario lo cierra (lo que se estaba haciendo queda guardado para cuando vuelva).
  const onClickCapture = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href");
    if (a && href?.startsWith("/") && a.target !== "_blank" && !e.metaKey && !e.ctrlKey && !e.shiftKey) closeAdvisor();
  };

  const clipFrom = useMemo<CSSProperties>(() => {
    const o = origin;
    const w = typeof window === "undefined" ? 0 : window.innerWidth;
    const h = typeof window === "undefined" ? 0 : window.innerHeight;
    const inset = o ? `${Math.max(0, o.y)}px ${Math.max(0, w - (o.x + o.w))}px ${Math.max(0, h - (o.y + o.h))}px ${Math.max(0, o.x)}px round 32px` : "48% 38% 48% 38% round 32px";
    return { "--advisor-clip-from": `inset(${inset})` } as CSSProperties;
  }, [origin]);

  const api = useMemo<StageApi | null>(
    () => (config ? { config, shown, setTalking, surprise, userScrolledRef, track, release, close: closeAdvisor } : null),
    [config, shown, surprise, track, release]
  );

  if (!mounted || !config || !api) return null;

  const status = busyLabel ? busyLabel : talking ? "Respondiendo" : "Listo";

  return createPortal(
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      tabIndex={-1}
      className="advisor-stage"
      data-agent={config.id}
      data-open={shown ? "true" : "false"}
      data-settled={settled ? "true" : "false"}
      style={clipFrom}
      onClickCapture={onClickCapture}
    >
      <header className="advisor-top">
        <div className="hero-eyebrow advisor-status" aria-live="polite">
          <span className="hero-eyebrow-dot" aria-hidden="true" />
          <span>{status}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {headerActions}
          <button type="button" onClick={closeAdvisor} className="advisor-icon-btn" aria-label="Cerrar">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </header>

      <div className="advisor-body">
        <aside ref={heroRef} className="advisor-hero">
          <div ref={veilRef} className="advisor-hero-veil" aria-hidden />
          <div ref={mascotRef} className="advisor-mascot-wrap">
            <MascotCanvasLazy
              modelUrl={config.modelUrl}
              roles={config.roles}
              disabled={config.disabled}
              framing={config.framing}
              base={talking ? "talking" : "idle"}
              surpriseKey={surpriseKey}
              paused={!shown}
              poster={config.poster}
              forceMotion={preview || undefined}
            />
          </div>
          <div className="advisor-id">
            <h2 className="advisor-name">{config.displayName}</h2>
            <p className="advisor-desc">{config.description}</p>
          </div>
        </aside>

        <StageContext.Provider value={api}>{children}</StageContext.Provider>
      </div>
    </div>,
    document.body
  );
}
