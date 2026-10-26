"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Copy, FlaskConical, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import type { Preview } from "@/lib/mail/preview";
import { mailApi, MailApiError } from "./mail-api";

type Sample = { subject: string; text: string };

/** La consulta de ejemplo de la inmobiliaria: `undefined` mientras carga, `null` si todavía no tiene propiedades publicadas. */
function useSample(agencyId: string | null): Sample | null | undefined {
  const [sample, setSample] = useState<Sample | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    mailApi<{ sample: Sample | null }>("/preview", agencyId)
      .then((r) => alive && setSample(r.sample))
      .catch(() => alive && setSample(null));
    return () => {
      alive = false;
    };
  }, [agencyId]);
  return sample;
}

const confidenceText = (c: number) => (c >= 0.8 ? "alta" : c >= 0.6 ? "media" : "baja");

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      window.setTimeout(() => setDone(false), 1800);
    } catch {
      // Sin permiso para el portapapeles: se puede seleccionar el texto a mano.
    }
  };
  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => void copy()} aria-live="polite">
      {done ? <Check className="h-4 w-4 text-success" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      {done ? "Copiado" : label}
    </Button>
  );
}

const field = "w-full rounded-media border border-border bg-surface-2 px-3.5 py-2.5 text-[15px] text-text outline-none focus:border-accent/60";

/** Lo que entendió el agente y lo que respondería, en palabras comunes. */
function PreviewResult({ r }: { r: Preview }) {
  return (
    <div className="swap-in flex flex-col gap-4 rounded-media bg-surface-2 p-4 sm:p-5" role="status">
      <p className="text-sm text-text">
        {r.inquiry && r.uncertain ? (
          <>
            <strong className="font-semibold">Creo que es una consulta, pero no estoy seguro de qué necesita.</strong> No la descarto: te la dejaría para que la revises.
          </>
        ) : r.inquiry ? (
          <>
            Lo entendí como: <strong className="font-semibold">{r.categoryLabel}</strong> · seguridad {confidenceText(r.confidence)}
            {r.searchLabel ? <> · busca {r.searchLabel}</> : null}.
          </>
        ) : (
          <>
            Esto no lo respondería: <strong className="font-semibold">{r.categoryLabel.toLowerCase()}</strong>.
          </>
        )}
      </p>

      {r.reasons.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Por qué</h4>
          <ul className="mt-1 list-disc pl-5 text-sm text-text-muted">
            {r.reasons.slice(0, 5).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {r.inquiry && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{r.properties.length > 1 ? "Propiedades que encontré" : "Propiedad que encontré"}</h4>
          {r.properties.length > 0 ? (
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {r.properties.map((p) => (
                <li key={p.title}>
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium text-accent hover:underline">
                      {p.title}
                    </a>
                  ) : (
                    <span className="font-medium text-text">{p.title}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-text-muted">
              {r.unavailable ? "Nombra una propiedad que ya no está publicada: propongo alternativas." : "No identifiqué una propiedad concreta en el mensaje."}
              {r.alternatives.length > 0 && ` Sugeriría: ${r.alternatives.map((p) => p.title).join(", ")}.`}
            </p>
          )}
        </div>
      )}

      {r.needsHuman && (
        <p className="flex items-start gap-2 rounded-media bg-warning-soft px-3.5 py-2.5 text-sm text-text">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span>Hay algo que tiene que contestar una persona: {r.humanTopics.join(", ") || "una duda puntual"}. El borrador no lo resuelve.</span>
        </p>
      )}

      {r.draft && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Así respondería</h4>
          <div className="mt-1.5 rounded-media bg-surface p-4 shadow-pop">
            <p className="text-sm font-semibold text-text [overflow-wrap:anywhere]">{r.draft.subject}</p>
            <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-text [overflow-wrap:anywhere]">{r.draft.body}</p>
          </div>
        </div>
      )}

      {r.autoVerdict && (
        <p className="text-sm text-text-muted">
          Con tu configuración actual ({r.mode === "auto" ? "modo automático" : "modo con confirmación"}):{" "}
          <strong className="font-semibold text-text">{r.autoVerdict.auto ? "saldría sola" : "te la dejaría para confirmar"}</strong>. {r.autoVerdict.why}
          {r.autoVerdict.auto && " (Si quien escribe pasa las verificaciones del correo; si no, queda para confirmar.)"}
          {r.ifAuto && (
            <>
              {" "}
              Si pasaras a automático: <strong className="font-semibold text-text">{r.ifAuto.auto ? "saldría sola" : "no saldría sola"}</strong>
              {r.ifAuto.auto ? "." : " (" + r.ifAuto.why.replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase()) + ")."}
            </>
          )}
        </p>
      )}
      <p className="text-xs text-text-muted">Es una simulación: no se guardó ni se envió nada.</p>
    </div>
  );
}

/**
 * "Probá cómo respondería": una consulta de ejemplo (editable) y lo que haría el agente con ella, sin conectar ninguna casilla.
 * Sirve para entender al agente antes de conectarlo y para ver cómo quedan los cambios de configuración (saludo, firma…).
 */
export function MailTryOut({ agencyId, defaultOpen = false }: { agencyId: string | null; defaultOpen?: boolean }) {
  const sample = useSample(agencyId);
  const [edit, setEdit] = useState<{ name?: string; subject?: string; text?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: number; data: Preview } | null>(null);

  const name = edit.name ?? "Juan Pérez";
  const subject = edit.subject ?? sample?.subject ?? "";
  const text = edit.text ?? sample?.text ?? "";

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await mailApi<Preview>("/preview", agencyId, { method: "POST", body: JSON.stringify({ subject, text, fromName: name }) });
      setResult((prev) => ({ id: (prev?.id ?? 0) + 1, data }));
    } catch (e) {
      setError(e instanceof MailApiError ? e.message : "No se pudo probar ahora.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="group rounded-card bg-surface shadow-card" open={defaultOpen}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 [&::-webkit-details-marker]:hidden">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent" aria-hidden>
          <FlaskConical className="h-4.5 w-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base font-bold text-text">Probá cómo respondería</span>
          <span className="block text-sm text-text-muted">Una consulta de ejemplo, sin conectar tu casilla.</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 group-open:rotate-180" aria-hidden />
      </summary>

      <div className="flex flex-col gap-4 px-5 pb-5">
        <p className="text-sm text-text-muted">
          Escribí (o dejá) una consulta como la de un cliente y mirá qué entiendo y qué le respondería, con tus propiedades y tu configuración. Es una simulación: no se guarda ni se envía nada.
        </p>
        {sample === null && (
          <p className="rounded-media bg-surface-2 px-3.5 py-2.5 text-sm text-text-muted">Todavía no tenés propiedades publicadas: publicá una y el ejemplo la va a nombrar. Igual podés escribir tu propia consulta.</p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
            Quién escribe
            <input value={name} maxLength={80} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={field} autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
            Asunto
            <input value={subject} maxLength={200} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} className={field} autoComplete="off" placeholder="Consulta por una propiedad" />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
          Mensaje del cliente
          <textarea value={text} maxLength={4000} rows={6} onChange={(e) => setEdit({ ...edit, text: e.target.value })} className={cn(field, "resize-y leading-relaxed")} placeholder="Hola, vi una propiedad en tu sitio. ¿Sigue disponible?" />
        </label>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button type="button" onClick={() => void run()} disabled={busy || text.trim().length < 3}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {busy ? "Pensando…" : "Ver cómo respondería"}
          </Button>
          {sample && (edit.text !== undefined || edit.subject !== undefined) && (
            <Button type="button" variant="ghost" onClick={() => setEdit({})}>
              Volver al ejemplo
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {result && <PreviewResult key={result.id} r={result.data} />}
      </div>
    </details>
  );
}

/** Cómo probar con un mail de verdad cuando la casilla ya está conectada (y todavía no llegó ninguno). */
export function MailRealTestGuide({ agencyId, email }: { agencyId: string | null; email: string }) {
  const sample = useSample(agencyId);
  return (
    <section className="flex flex-col gap-3 rounded-card bg-surface p-5 shadow-card" aria-labelledby="real-test-title">
      <h3 id="real-test-title" className="font-display text-base font-bold text-text">
        ¿Cómo pruebo con un mail de verdad?
      </h3>
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-text-muted marker:font-semibold">
        <li>
          Desde <strong className="font-semibold text-text">otra</strong> cuenta de correo, escribile a <strong className="font-semibold text-text [overflow-wrap:anywhere]">{email}</strong>. Lo que manda la propia casilla se ignora.
        </li>
        <li>Pegá en el mensaje un texto que nombre una de tus propiedades (te dejo uno de ejemplo).</li>
        <li>
          Esperá hasta 5 minutos o tocá <strong className="font-semibold text-text">Revisar ahora</strong>. Sólo cuento lo que llega <em>después</em> de conectar la casilla.
        </li>
        <li>Aparece en “Para confirmar”: revisalo y enviá. La respuesta sale desde {email}.</li>
      </ol>
      {sample && (
        <div className="flex flex-col gap-2 rounded-media bg-surface-2 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Texto de ejemplo</p>
          <p className="whitespace-pre-wrap text-sm text-text [overflow-wrap:anywhere]">{`${sample.subject}\n\n${sample.text}`}</p>
          <div>
            <CopyButton text={`${sample.subject}\n\n${sample.text}`} label="Copiar el ejemplo" />
          </div>
        </div>
      )}
      <p className="text-xs text-text-muted">Para probar conviene una casilla de prueba y no tu casilla personal: leo todo lo nuevo que le llegue.</p>
    </section>
  );
}
