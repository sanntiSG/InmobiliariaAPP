"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { AdvisorAnswer, SuggestionQuery } from "@/lib/advisor/types";
import { AnswerView } from "./AnswerView";
import { Composer, SuggestionChips } from "./Composer";
import { MascotCanvasLazy } from "./mascot/MascotCanvasLazy";
import { StreamedText } from "./StreamedText";
import { ask, closeAdvisor, loadBriefing, markStreamed, resetThread, useAdvisorState, type Turn } from "./store";

const EXIT_MS = 300;

// Saludos ya escritos: un mismo briefing no se vuelve a "hablar" al reabrir el escenario.
const greeted = new WeakSet<object>();

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';

/** Puntos suspensivos mientras el servidor calcula: el asesor sigue en reposo. */
function Thinking() {
  return (
    <p className="advisor-thinking text-sm text-text-muted" role="status">
      Analizando tus datos
      <span aria-hidden className="advisor-dots">
        <i />
        <i />
        <i />
      </span>
    </p>
  );
}

/**
 * El escenario del asesor: pantalla completa, mascota 3D y conversación. Se abre con un `clip-path`
 * desde el lanzador (CSS, ~460 ms) y se cierra más rápido. El estado de la charla vive en el
 * store del layout raíz: cerrar y reabrir, o navegar, no la pierde.
 */
export default function AdvisorStage() {
  const s = useAdvisorState();
  const router = useRouter();
  const pathname = usePathname();
  const { open, mode, config } = s;
  const thread = s.threads[mode];

  // Montaje y apertura sólo dentro de rAF/timeouts (nunca setState en el render: eso rompió `Sheet`).
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
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
    const r = requestAnimationFrame(() => setShown(false));
    const t = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => {
      cancelAnimationFrame(r);
      window.clearTimeout(t);
    };
  }, [open]);

  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  // Mascota: "habla" mientras aparece el texto; sorprendida si la respuesta trae algo fuera de lo común.
  const [talking, setTalking] = useState(false);
  const [surpriseKey, setSurpriseKey] = useState(0);
  const [compact, setCompact] = useState(false);
  // La mascota se achica sólo cuando la PERSONA desliza el hilo, no cuando el escenario baja solo a una respuesta nueva.
  const userScrolled = useRef(false);
  const onTalkStart = useCallback((mood: AdvisorAnswer["mood"]) => {
    setTalking(true);
    if (mood === "surprised") setSurpriseKey((k) => k + 1);
  }, []);
  const onTalkEnd = useCallback(() => setTalking(false), []);

  const turns = thread.turns;
  const pending = turns.some((t) => t.role === "assistant" && t.status === "pending");
  const lastTurn = turns[turns.length - 1];
  const lastAnswer = lastTurn?.role === "assistant" && lastTurn.status === "done" ? lastTurn : null;

  // Foco, Esc, scroll bloqueado y foco de vuelta al cerrar.
  useEffect(() => {
    if (!mounted) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const raf = requestAnimationFrame(() => {
      // En el celular no se enfoca el input solo: abriría el teclado y taparía la mascota.
      if (coarse) root.current?.focus();
      else document.getElementById("advisor-input")?.focus();
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

  // Al llegar una respuesta se muestra DESDE SU PRINCIPIO (el texto principal es lo primero que se lee);
  // mientras se espera, se baja hasta el "Analizando…".
  useEffect(() => {
    const el = scroller.current;
    if (!el || !mounted) return;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    const target = pending ? null : el.querySelector<HTMLElement>('article[data-latest="true"]');
    const top = target ? target.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 12 : el.scrollHeight;
    userScrolled.current = false;
    const raf = requestAnimationFrame(() => setCompact(false));
    el.scrollTo({ top, behavior });
    return () => cancelAnimationFrame(raf);
  }, [turns.length, pending, mounted]);

  // El saludo se escribe una sola vez por apertura de charla.
  const briefing = thread.briefing;
  const greetingFresh = !!briefing && !greeted.has(briefing);

  const openProperty = useCallback(
    (slug: string) => {
      closeAdvisor();
      router.push(`/propiedades/${slug}`);
    },
    [router]
  );

  const pick = useCallback((sug: SuggestionQuery) => void ask(mode, { query: { intent: sug.intent, slots: sug.slots }, label: sug.label }), [mode]);

  // Tocar un enlace interno dentro del escenario lo cierra (la charla queda guardada para cuando vuelva).
  const onClickCapture = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href");
    if (a && href?.startsWith("/") && a.target !== "_blank" && !e.metaKey && !e.ctrlKey && !e.shiftKey) closeAdvisor();
  };

  const clipFrom = useMemo<CSSProperties>(() => {
    const o = s.origin;
    const w = typeof window === "undefined" ? 0 : window.innerWidth;
    const h = typeof window === "undefined" ? 0 : window.innerHeight;
    const inset = o ? `${Math.max(0, o.y)}px ${Math.max(0, w - (o.x + o.w))}px ${Math.max(0, h - (o.y + o.h))}px ${Math.max(0, o.x)}px round 32px` : "48% 38% 48% 38% round 32px";
    return { "--advisor-clip-from": `inset(${inset})` } as CSSProperties;
  }, [s.origin]);

  if (!mounted || !config) return null;

  const chips: SuggestionQuery[] = lastAnswer
    ? lastAnswer.answer.followUps
    : turns.length === 0
      ? (briefing?.suggestions ?? [])
      : [];
  const status = pending ? "Analizando" : talking ? "Respondiendo" : "Listo";
  const lastDoneIndex = turns.reduce((acc, t, i) => (t.role === "assistant" && t.status === "done" ? i : acc), -1);

  const renderTurn = (turn: Turn, index: number) => {
    if (turn.role === "user") {
      return (
        <p key={turn.id} className="advisor-ask">
          {turn.text}
        </p>
      );
    }
    if (turn.status === "pending") return <Thinking key={turn.id} />;
    if (turn.status === "error") {
      return (
        <div key={turn.id} className="flex flex-wrap items-center gap-3 rounded-media bg-danger-soft px-4 py-3 text-sm text-text">
          <span className="min-w-0 flex-1">{turn.message}</span>
          {turn.retry && (
            <button type="button" onClick={() => void ask(mode, turn.retry!)} className="rounded-full px-3 py-1.5 text-sm font-semibold text-accent hover:underline">
              Reintentar
            </button>
          )}
        </div>
      );
    }
    return (
      <AnswerView
        key={turn.id}
        answer={turn.answer}
        fresh={turn.fresh}
        latest={index === lastDoneIndex}
        onTalkStart={(mood) => {
          onTalkStart(mood);
        }}
        onTalkEnd={() => {
          onTalkEnd();
          markStreamed(mode, turn.id);
        }}
        onOpenProperty={openProperty}
      />
    );
  };

  return createPortal(
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={`Conversación con ${config.displayName}`}
      tabIndex={-1}
      className="advisor-stage"
      data-open={shown ? "true" : "false"}
      style={clipFrom}
      onClickCapture={onClickCapture}
    >
      <header className="advisor-top">
        <div className="hero-eyebrow advisor-status" aria-live="polite">
          <span className="hero-eyebrow-dot" aria-hidden="true" />
          <span>{status}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {turns.length > 0 && (
            <button type="button" onClick={() => resetThread(mode)} className="advisor-icon-btn" aria-label="Empezar una charla nueva" title="Charla nueva">
              <RotateCcw className="h-[18px] w-[18px]" aria-hidden />
            </button>
          )}
          <button type="button" onClick={closeAdvisor} className="advisor-icon-btn" aria-label="Cerrar">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </header>

      <div className="advisor-body">
        <aside className="advisor-hero" data-compact={compact ? "true" : "false"}>
          <div className="advisor-mascot-wrap">
            <MascotCanvasLazy
              modelUrl={config.modelUrl}
              roles={config.roles}
              disabled={config.disabled}
              framing={config.framing}
              base={talking ? "talking" : "idle"}
              surpriseKey={surpriseKey}
              paused={!shown}
              poster={config.poster}
              forceMotion={s.preview || undefined}
            />
          </div>
          <div className="advisor-id">
            <h2 className="advisor-name">{config.displayName}</h2>
            <p className="advisor-desc">{config.description}</p>
          </div>
        </aside>

        <section className="advisor-thread-wrap">
          <div
            ref={scroller}
            className="advisor-thread"
            onWheel={() => (userScrolled.current = true)}
            onTouchMove={() => (userScrolled.current = true)}
            onScroll={(e) => {
              if (userScrolled.current) setCompact(e.currentTarget.scrollTop > 24);
            }}
          >
            {turns.length === 0 && (
              <div className="flex flex-col gap-4">
                {briefing ? (
                  <>
                    <StreamedText
                      key={briefing.greeting}
                      text={briefing.greeting}
                      fresh={greetingFresh}
                      onStart={() => onTalkStart(briefing.mood)}
                      onEnd={() => {
                        greeted.add(briefing);
                        onTalkEnd();
                      }}
                      className="advisor-lead"
                    />
                    {briefing.headlines.length > 0 && (
                      <ul className="flex flex-col gap-2">
                        {briefing.headlines.map((h) => (
                          <li key={h.text} className="flex items-start gap-2.5 text-[15px] text-text">
                            <span
                              className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", h.tone === "good" ? "bg-success" : h.tone === "bad" ? "bg-danger" : "bg-text-muted")}
                              aria-hidden
                            />
                            {h.text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : thread.briefingState === "error" ? (
                  <div className="flex flex-col items-start gap-3">
                    <p className="advisor-lead">No pude prepararme ahora.</p>
                    <button type="button" onClick={() => void loadBriefing(mode)} className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-text active:scale-[0.97]">
                      Probar de nuevo
                    </button>
                  </div>
                ) : (
                  <Thinking />
                )}
              </div>
            )}
            {turns.map(renderTurn)}
          </div>

          <div className="advisor-dock">
            <SuggestionChips items={chips} disabled={pending} onPick={pick} />
            <Composer
              disabled={pending}
              quota={thread.quota}
              returnTo={pathname}
              placeholder={mode === "agency" ? `Preguntale a ${config.displayName} por tus propiedades…` : "Contame qué buscás…"}
              onSend={(text) => void ask(mode, { text })}
            />
          </div>
        </section>
      </div>
    </div>,
    document.body
  );
}
