"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { INQUIRY_CATEGORIES, MAIL_CATEGORY_LABELS, MAIL_LIMITS, type MailCategory, type MailMode } from "@/lib/mail/constants";
import type { MailSettingsView } from "@/lib/mail/settings";
import { mailApi, MailApiError } from "./mail-api";

const MODES: { id: MailMode; title: string; badge?: string; text: string }[] = [
  { id: "confirm", title: "Con confirmación", badge: "Recomendado", text: "Preparo cada respuesta y te aviso. Nada se envía hasta que una persona del equipo la confirma." },
  { id: "auto", title: "Automático", text: "Respondo solo las consultas claras (con las condiciones de abajo). Lo dudoso o delicado siempre queda para confirmar." },
];

const box = "rounded-card bg-surface p-5 shadow-card";
const field = "w-full rounded-media border border-border bg-surface-2 px-3.5 py-2.5 text-[15px] text-text outline-none focus:border-accent/60";

/**
 * Configuración del agente de correo: cómo responde, qué firma, cuándo puede responder solo y a quién no. Sólo la ve quien
 * administra la inmobiliaria. Guarda de una vez lo que se tocó; el servidor valida y limpia cada campo.
 */
export function MailSettingsForm({ agencyId, initial, onSaved }: { agencyId: string | null; initial: MailSettingsView; onSaved?: (s: MailSettingsView) => void }) {
  const [s, setS] = useState<MailSettingsView>(initial);
  const [blocked, setBlocked] = useState(initial.blockedSenders.join("\n"));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<null | { ok: boolean; text: string }>(null);
  const set = <K extends keyof MailSettingsView>(key: K, value: MailSettingsView[K]) => {
    setStatus(null);
    setS((prev) => ({ ...prev, [key]: value }));
  };

  const toggleCategory = (c: MailCategory) => set("autoCategories", s.autoCategories.includes(c) ? s.autoCategories.filter((x) => x !== c) : [...s.autoCategories, c]);

  const save = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const body = {
        ...s,
        blockedSenders: blocked
          .split(/[\n,;]+/)
          .map((x) => x.trim())
          .filter(Boolean),
      };
      const saved = await mailApi<MailSettingsView>("/settings", agencyId, { method: "PATCH", body: JSON.stringify(body) });
      setS(saved);
      setBlocked(saved.blockedSenders.join("\n"));
      onSaved?.(saved);
      setStatus({ ok: true, text: "Guardado." });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof MailApiError ? e.message : "No se pudo guardar." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex max-w-2xl flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <section className={box} aria-labelledby="mail-mode">
        <h2 id="mail-mode" className="font-display text-lg font-bold text-text">
          Cómo respondo
        </h2>
        <div role="radiogroup" aria-labelledby="mail-mode" className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={s.mode === m.id}
              onClick={() => set("mode", m.id)}
              className={cn(
                "flex flex-col gap-1.5 rounded-media p-4 text-left transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.98]",
                s.mode === m.id ? "bg-accent-soft ring-2 ring-accent" : "bg-surface-2 hover:bg-surface-sunken"
              )}
            >
              <span className="flex items-center gap-2">
                <span className="font-display text-base font-bold text-text">{m.title}</span>
                {m.badge && <span className="rounded-pill bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">{m.badge}</span>}
              </span>
              <span className="text-sm text-text-muted">{m.text}</span>
            </button>
          ))}
        </div>

        {s.mode === "auto" && (
          <div className="mt-5 flex flex-col gap-4 border-t border-border pt-4">
            <div className="rounded-media bg-surface-2 p-4 text-sm text-text-muted">
              <p className="font-semibold text-text">Cuándo sale sola una respuesta</p>
              <ul className="mt-1.5 list-disc pl-5">
                <li>Es una consulta clara de uno de los tipos de abajo.</li>
                <li>Nombra una de tus propiedades{s.autoSearches ? ", o pide algo que tenés publicado (por ejemplo “casas en venta en Ezeiza”)" : ""}.</li>
                <li>Quien escribe pasó las verificaciones del correo (así sé que no es un remitente falso).</li>
                <li>No hay nada que tenga que contestar una persona (financiación, garantía, permuta, un reclamo…).</li>
                <li>Está dentro del horario y de los máximos por día y por persona.</li>
              </ul>
              <p className="mt-1.5">Si algo de esto no se cumple, la respuesta queda en “Para confirmar” y te digo por qué no salió sola. Se revisa la casilla cada 5 minutos, o al tocar “Revisar ahora”.</p>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-text">Qué puedo responder solo</legend>
              <div className="flex flex-wrap gap-2">
                {INQUIRY_CATEGORIES.map((c) => {
                  const on = s.autoCategories.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleCategory(c)}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-sm font-medium transition-colors",
                        on ? "bg-accent text-accent-contrast" : "bg-surface-2 text-text-muted hover:text-text"
                      )}
                    >
                      {on && <Check className="h-3.5 w-3.5" aria-hidden />}
                      {MAIL_CATEGORY_LABELS[c]}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-text-muted">Las visitas conviene confirmarlas: hay que coordinar un día y un horario.</p>
            </fieldset>

            <label className="flex items-start gap-2.5 text-sm text-text">
              <input type="checkbox" checked={s.autoSearches} onChange={(e) => set("autoSearches", e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
              <span>
                También responder solo cuando preguntan por algo que tengo publicado, sin nombrar una propiedad puntual (por ejemplo “casas en venta en Ezeiza”): les muestro las propiedades que coinciden.
                <span className="block text-xs text-text-muted">Si no tengo nada que coincida, la respuesta queda para que la confirmes.</span>
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
                Máximo de respuestas automáticas por día
                <input type="number" min={1} max={MAIL_LIMITS.autoPerDayMax} value={s.autoPerDay} onChange={(e) => set("autoPerDay", Math.max(1, Math.min(MAIL_LIMITS.autoPerDayMax, Number(e.target.value) || 1)))} className={cn(field, "max-w-32")} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
                Máximo por persona por día
                <input type="number" min={1} max={MAIL_LIMITS.autoPerSenderMax} value={s.autoPerSender} onChange={(e) => set("autoPerSender", Math.max(1, Math.min(MAIL_LIMITS.autoPerSenderMax, Number(e.target.value) || 1)))} className={cn(field, "max-w-32")} />
                <span className="text-xs font-normal text-text-muted">Frena los bucles; pasado el tope, queda para confirmar.</span>
              </label>
            </div>

            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2.5 text-sm font-medium text-text">
                <input type="checkbox" checked={s.schedule.enabled} onChange={(e) => set("schedule", { ...s.schedule, enabled: e.target.checked })} className="size-4 accent-[var(--accent)]" />
                Responder solo en un horario (hora de Argentina)
              </label>
              {s.schedule.enabled && (
                <div className="flex flex-wrap items-center gap-2 pl-6 text-sm text-text-muted">
                  de
                  <input type="time" value={s.schedule.from} onChange={(e) => set("schedule", { ...s.schedule, from: e.target.value })} className={cn(field, "w-auto")} aria-label="Desde" />
                  a
                  <input type="time" value={s.schedule.to} onChange={(e) => set("schedule", { ...s.schedule, to: e.target.value })} className={cn(field, "w-auto")} aria-label="Hasta" />
                  <span className="basis-full text-xs">Fuera de ese horario, las respuestas quedan para confirmar.</span>
                </div>
              )}
            </div>

            <label className="flex items-start gap-2.5 text-sm text-text">
              <input type="checkbox" checked={s.disclose} onChange={(e) => set("disclose", e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
              <span>
                Avisar al final de cada respuesta automática que la preparó un asistente <span className="text-text-muted">(recomendado)</span>.
              </span>
            </label>
          </div>
        )}
      </section>

      <section className={box} aria-labelledby="mail-text">
        <h2 id="mail-text" className="font-display text-lg font-bold text-text">
          Cómo suenan mis respuestas
        </h2>
        <div className="mt-3 grid gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
            Saludo inicial
            <input value={s.greeting} maxLength={160} onChange={(e) => set("greeting", e.target.value)} className={field} placeholder="Si lo dejás vacío, alterno: “Gracias por escribirnos.”, “Gracias por tu consulta.”…" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
            Cierre
            <input value={s.closing} maxLength={160} onChange={(e) => set("closing", e.target.value)} className={field} placeholder="Quedamos atentos a tu respuesta." />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
            Firma
            <input value={s.signature} maxLength={200} onChange={(e) => set("signature", e.target.value)} className={field} placeholder="Equipo de tu inmobiliaria" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
            Propiedades por respuesta (máximo)
            <select value={s.maxProperties} onChange={(e) => set("maxProperties", Number(e.target.value))} className={cn(field, "max-w-40")}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className={box} aria-labelledby="mail-block">
        <h2 id="mail-block" className="font-display text-lg font-bold text-text">
          A quién no le respondo
        </h2>
        <label className="mt-3 flex flex-col gap-1.5 text-sm font-medium text-text">
          Emails o dominios (uno por renglón)
          <textarea value={blocked} onChange={(e) => { setStatus(null); setBlocked(e.target.value); }} rows={4} className={cn(field, "resize-y")} placeholder={"alguien@ejemplo.com\nspam-total.com"} spellCheck={false} />
        </label>
        <p className="mt-1.5 text-xs text-text-muted">Si marcás “No es una consulta” dos veces sobre la misma persona, la agrego sola.</p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Guardando…" : "Guardar cambios"}
        </Button>
        {status && (
          <p role={status.ok ? "status" : "alert"} className={cn("text-sm", status.ok ? "text-success" : "text-danger")}>
            {status.text}
          </p>
        )}
      </div>
    </form>
  );
}
