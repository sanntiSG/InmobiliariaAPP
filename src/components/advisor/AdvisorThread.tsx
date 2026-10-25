"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import type { AdvisorAnswer, AdvisorMode, SuggestionQuery } from "@/lib/advisor/types";
import { AnswerView } from "./AnswerView";
import { Composer, SuggestionChips } from "./Composer";
import { StreamedText } from "./StreamedText";
import { useStage } from "./StageFrame";
import { ask, closeAdvisor, loadBriefing, markStreamed, useAdvisorState, type Turn } from "./store";

// Saludos ya escritos: un mismo briefing no se vuelve a "hablar" al reabrir el escenario.
const greeted = new WeakSet<object>();

/** Puntos suspensivos mientras el servidor calcula: el asesor sigue en reposo. */
export function Thinking() {
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
 * La conversación del asesor: saludo, preguntas y respuestas, sugerencias y el campo para escribir. Va dentro del marco del
 * escenario (`StageFrame`). El estado de la charla vive en el store del layout raíz: cerrar y reabrir, o navegar, no la pierde.
 */
export function AdvisorThread({ mode }: { mode: AdvisorMode }) {
  const s = useAdvisorState();
  const router = useRouter();
  const pathname = usePathname();
  const { config, setTalking, surprise, userScrolledRef, track, release } = useStage();
  const thread = s.threads[mode];
  const scroller = useRef<HTMLDivElement>(null);

  const onTalkStart = useCallback(
    (mood: AdvisorAnswer["mood"]) => {
      setTalking(true);
      if (mood === "surprised") surprise();
    },
    [setTalking, surprise]
  );
  const onTalkEnd = useCallback(() => setTalking(false), [setTalking]);

  const turns = thread.turns;
  const pending = turns.some((t) => t.role === "assistant" && t.status === "pending");
  const lastTurn = turns[turns.length - 1];
  const lastAnswer = lastTurn?.role === "assistant" && lastTurn.status === "done" ? lastTurn : null;

  // Al llegar una respuesta se muestra DESDE SU PRINCIPIO (el texto principal es lo primero que se lee);
  // mientras se espera, se baja hasta el "Analizando…". En el celular el hilo tiene un relleno arriba del
  // alto de la mascota grande: el principio de la respuesta queda justo debajo de ella, y desde ahí
  // (el "ancla") empieza a achicarse a medida que se desliza.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    const target = pending ? null : el.querySelector<HTMLElement>('article[data-latest="true"]');
    const padTop = parseFloat(getComputedStyle(el).paddingTop) || 0;
    const wanted = target ? target.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - (padTop + 4) : el.scrollHeight;
    const top = Math.max(0, Math.min(wanted, el.scrollHeight - el.clientHeight));
    userScrolledRef.current = false;
    release(top);
    el.scrollTo({ top, behavior });
  }, [turns.length, pending, release, userScrolledRef]);

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

  const chips: SuggestionQuery[] = lastAnswer
    ? lastAnswer.answer.followUps
    : turns.length === 0
      ? (briefing?.suggestions ?? [])
      : [];
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
        onTalkStart={onTalkStart}
        onTalkEnd={() => {
          onTalkEnd();
          markStreamed(mode, turn.id);
        }}
        onOpenProperty={openProperty}
      />
    );
  };

  return (
    <section className="advisor-thread-wrap">
      <div
        ref={scroller}
        className="advisor-thread"
        onWheel={() => (userScrolledRef.current = true)}
        onTouchMove={() => (userScrolledRef.current = true)}
        onScroll={(e) => {
          if (userScrolledRef.current) track(e.currentTarget.scrollTop);
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
  );
}
