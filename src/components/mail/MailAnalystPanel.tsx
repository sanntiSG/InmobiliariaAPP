"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { BlockView } from "@/components/advisor/blocks";
import { withAgencyParam } from "@/lib/notifications/agency-link";
import { cn } from "@/lib/utils/cn";
import type { AnalystAnswer, AnalystBriefing, AnalystOption, AnalystTone } from "@/lib/mail/analyst";
import { mailApi } from "./mail-api";

type Payload = { briefing: AnalystBriefing; answer: AnalystAnswer | null };

const DOT: Record<AnalystTone, string> = { good: "bg-success", warn: "bg-warning", neutral: "bg-text-muted/50" };
const noop = () => undefined;

/**
 * El analista del correo: resúmenes y recomendaciones con OPCIONES FIJAS (no es un chat). Arriba, uno o dos titulares sobre lo que
 * pasó; debajo, las opciones (lo recibido, lo enviado, lo que más preguntan, lo que necesita a una persona, la actividad reciente y
 * qué se puede mejorar). Tocar una muestra la respuesta con números y, en las recomendaciones, qué hacer con un enlace directo.
 * Es la misma idea que el asesor principal de la inmobiliaria, pero para la bandeja de correo.
 */
export function MailAnalystPanel({ agencyId }: { agencyId: string | null }) {
  const [data, setData] = useState<Payload | null>(null);
  const [option, setOption] = useState<AnalystOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);

  const load = useCallback(
    async (opt: AnalystOption | null) => {
      setLoading(true);
      setFailed(false);
      try {
        const r = await mailApi<Payload>(`/analyst${opt ? `?option=${opt}` : ""}`, agencyId);
        if (!alive.current) return;
        setData(r);
        setOption(opt);
      } catch {
        if (alive.current) setFailed(true);
      } finally {
        if (alive.current) setLoading(false);
      }
    },
    [agencyId]
  );

  useEffect(() => {
    alive.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de los titulares (sólo existen en el servidor)
    void load(null);
    return () => {
      alive.current = false;
    };
  }, [load]);

  if (failed && !data) return null; // sin resumen la bandeja sigue funcionando igual
  if (!data) {
    return (
      <div className="h-[132px] animate-pulse rounded-card bg-surface shadow-card" aria-hidden />
    );
  }
  const { briefing, answer } = data;
  const labelOf = (o: AnalystOption) => briefing.options.find((x) => x.option === o)?.label ?? o;
  const href = (h: string) => withAgencyParam(h, agencyId ?? "") ?? h;

  return (
    <section aria-label="Resumen y recomendaciones" className="flex flex-col gap-3.5 rounded-card bg-surface p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent" aria-hidden>
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold text-text">Resumen y recomendaciones</h3>
          <ul className="mt-1 flex flex-col gap-1">
            {briefing.headlines.map((h) => (
              <li key={h.text} className="flex items-start gap-2 text-sm text-text">
                <span aria-hidden className={cn("mt-[7px] size-2 shrink-0 rounded-full", DOT[h.tone])} />
                {h.text}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Qué querés ver">
        {briefing.options.map((o) => {
          const on = option === o.option;
          return (
            <button
              key={o.option}
              type="button"
              aria-pressed={on}
              disabled={loading}
              onClick={() => (on ? void load(null) : void load(o.option))}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-pill border px-3 text-[13px] font-medium transition-[transform,background-color,border-color] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.97] pointer-coarse:min-h-11",
                on ? "border-accent/30 bg-accent-soft text-accent" : "border-border-hi bg-surface text-text hover:bg-surface-2",
                o.tone === "warn" && !on && "border-warning/40"
              )}
            >
              {o.label}
              {o.hint && <span className={cn("rounded-full px-1.5 font-mono text-[11px] font-semibold", on ? "bg-accent/15" : "bg-surface-2")}>{o.hint}</span>}
            </button>
          );
        })}
      </div>

      {answer && (
        <div key={answer.option} className="rise flex flex-col gap-3 border-t border-border pt-3.5" aria-live="polite">
          <p className="text-sm font-medium text-text">{answer.lead}</p>
          {answer.blocks.map((b, i) => (
            <BlockView key={`${b.type}-${i}`} block={b} onOpenProperty={noop} />
          ))}
          {answer.recommendations.length > 0 && (
            <ul className="flex flex-col gap-2">
              {answer.recommendations.map((r) => (
                <li key={r.title} className="flex gap-3 rounded-media bg-surface-2 p-3.5">
                  <span aria-hidden className={cn("mt-[7px] size-2 shrink-0 rounded-full", DOT[r.tone])} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text">{r.title}</p>
                    <p className="mt-0.5 text-sm text-text-muted">{r.detail}</p>
                    {r.action && (
                      <Link href={href(r.action.href)} className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-accent hover:underline pointer-coarse:min-h-11">
                        {r.action.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {answer.followUps.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-text-muted">Seguir con:</span>
              {answer.followUps.map((f) => (
                <button key={f} type="button" disabled={loading} onClick={() => void load(f)} className="inline-flex min-h-9 items-center rounded-pill bg-surface-2 px-3 text-[13px] font-medium text-text transition-colors hover:bg-surface-3 pointer-coarse:min-h-11">
                  {labelOf(f)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
