"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { GraduationCap, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import type { LessonRow } from "@/lib/agents/lessons";

export type IntentOption = { id: string; label: string; audience: "agency" | "explorer" | "both" };

const MAIL_TARGETS = [
  { id: "inquiry", label: "Es una consulta" },
  { id: "not_inquiry", label: "No es una consulta" },
] as const;

const fieldCls = "w-full rounded-media border border-border bg-surface-2 px-3.5 py-2.5 text-[15px] text-text outline-none focus:border-accent/60";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", ...init });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(data?.error ?? "No se pudo completar la acción.");
  return data as T;
}

/** Vuelve a leer las lecciones de un agente. */
export async function reloadLessons(agent: "advisor" | "mail"): Promise<LessonRow[]> {
  return (await call<{ items: LessonRow[] }>(`/api/admin/advisor/lessons?agent=${agent}`)).items;
}

/** Guarda una lección (una frase y lo que tiene que entender). Si viene de una pregunta no entendida, esa fila se borra. */
export async function teach(body: { agent: "advisor" | "mail"; target: string; text: string; unmatchedId?: string }): Promise<void> {
  await call("/api/admin/advisor/lessons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

/** Opciones agrupadas para el selector de intenciones, sólo las que existen en el modo indicado. */
function IntentSelect({ value, onChange, options, mode, id }: { value: string; onChange: (v: string) => void; options: IntentOption[]; mode?: "agency" | "explorer"; id: string }) {
  const visible = options.filter((o) => !mode || o.audience === "both" || o.audience === mode);
  const groups: { title: string; items: IntentOption[] }[] = [
    { title: "Para inmobiliarias", items: visible.filter((o) => o.audience === "agency") },
    { title: "Para quien explora", items: visible.filter((o) => o.audience === "explorer") },
    { title: "Para todos", items: visible.filter((o) => o.audience === "both") },
  ].filter((g) => g.items.length > 0);
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cn(fieldCls, "py-2")}>
      <option value="">Elegí qué tiene que entender…</option>
      {groups.map((g) => (
        <optgroup key={g.title} label={g.title}>
          {g.items.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** "Enseñar" sobre una pregunta que el asesor no entendió: elegís qué quería decir y queda aprendida. */
export function TeachRow({ text, mode, unmatchedId, options, onTaught }: { text: string; mode: "agency" | "explorer"; unmatchedId: string; options: IntentOption[]; onTaught: () => void }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" className="inline-flex min-h-8 items-center gap-1.5 text-xs font-semibold text-accent hover:underline pointer-coarse:min-h-11" onClick={() => setOpen(true)}>
        <GraduationCap className="h-3.5 w-3.5" aria-hidden /> Enseñar qué quiso decir
      </button>
    );
  }
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await teach({ agent: "advisor", target, text, unmatchedId });
      onTaught();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      setBusy(false);
    }
  };
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-media bg-surface-2 p-3">
      <label htmlFor={`teach-${unmatchedId}`} className="text-xs font-semibold text-text-muted">
        ¿Qué quiso decir?
      </label>
      <IntentSelect id={`teach-${unmatchedId}`} value={target} onChange={setTarget} options={options} mode={mode} />
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!target || busy} onClick={() => void save()}>
          {busy ? "Guardando…" : "Enseñar"}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/**
 * Lo que el admin le enseña a un agente (asesor o correo): frases con lo que tienen que entender. Siempre SUMA: no cambia
 * lo que el agente ya sabía, y se puede borrar cualquier lección si lo confunde.
 */
export function AgentLessons({
  agent,
  items,
  setItems,
  intentOptions,
  intentLabels,
}: {
  agent: "advisor" | "mail";
  items: LessonRow[];
  setItems: Dispatch<SetStateAction<LessonRow[]>>;
  intentOptions: IntentOption[];
  intentLabels: Record<string, string>;
}) {
  const [text, setText] = useState("");
  const [target, setTarget] = useState(agent === "mail" ? "inquiry" : "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const reload = () => reloadLessons(agent).then(setItems);

  const add = async () => {
    setBusy("add");
    setError(null);
    setDone(null);
    try {
      await teach({ agent, target, text });
      setText("");
      if (agent === "advisor") setTarget("");
      await reload();
      setDone("Listo: lo aprendió.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    setBusy(id);
    setError(null);
    setDone(null);
    try {
      await call("/api/admin/advisor/lessons", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      setItems((list) => list.filter((x) => x.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar.");
    } finally {
      setBusy(null);
    }
  };

  const labelOf = (row: LessonRow) => (agent === "mail" ? (MAIL_TARGETS.find((t) => t.id === row.target)?.label ?? row.target) : (intentLabels[row.target] ?? row.target));

  return (
    <section className="rounded-card bg-surface p-5 shadow-card" aria-labelledby={`lessons-${agent}`}>
      <h2 id={`lessons-${agent}`} className="font-display text-lg font-semibold">
        {agent === "mail" ? "Ejemplos que le enseñaste" : "Lo que le enseñaste"}
      </h2>
      <p className="mt-1 text-sm text-text-muted">
        {agent === "mail"
          ? "Valen para todas las inmobiliarias y sólo ayudan en los casos dudosos: un mail parecido a una consulta pasa a “Para confirmar” en vez de ignorarse, y uno parecido a un “no es consulta” se ignora. Nunca hacen que una respuesta salga sola. Además, el agente aprende de cada “Era una consulta” y “No es una consulta” que marcan las propias inmobiliarias."
          : "Frases que ahora entiende gracias a vos. Cada una suma: no cambia lo que el asesor ya sabía. Si una frase lo confunde, borrala."}
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
          {agent === "mail" ? "Un ejemplo de mail (asunto y comienzo del mensaje)" : "Una frase como la que escribiría alguien"}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={agent === "mail" ? 3 : 2}
            maxLength={agent === "mail" ? 640 : 320}
            className={cn(fieldCls, "resize-y leading-relaxed")}
            placeholder={agent === "mail" ? "Consulta por propiedad — Hola, vi el aviso y quisiera más datos…" : "che, cómo viene mi semana comparada con la anterior"}
          />
        </label>
        {agent === "mail" ? (
          <fieldset className="flex flex-wrap gap-2" aria-label="Qué es este mail">
            {MAIL_TARGETS.map((t) => (
              <label key={t.id} className={cn("inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-pill border px-3.5 text-sm font-medium transition-colors", target === t.id ? "border-accent/40 bg-accent-soft text-accent" : "border-border text-text-muted hover:text-text")}>
                <input type="radio" name="mail-lesson-target" className="sr-only" checked={target === t.id} onChange={() => setTarget(t.id)} />
                {t.label}
              </label>
            ))}
          </fieldset>
        ) : (
          <IntentSelect id="lesson-intent" value={target} onChange={setTarget} options={intentOptions} />
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={busy !== null || text.trim().length < 6 || !target} onClick={() => void add()}>
            <GraduationCap className="h-4 w-4" aria-hidden /> {busy === "add" ? "Guardando…" : "Enseñar"}
          </Button>
          {done && (
            <span role="status" className="text-sm text-success">
              {done}
            </span>
          )}
          {error && (
            <span role="alert" className="text-sm text-danger">
              {error}
            </span>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">Todavía no le enseñaste nada.</p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-border">
          {items.map((row) => (
            <li key={row.id} className="flex items-start gap-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block text-text [overflow-wrap:anywhere]">{row.text}</span>
                <span className="text-xs text-text-muted">→ {labelOf(row)}</span>
              </span>
              <button
                type="button"
                aria-label="Borrar esta lección"
                disabled={busy === row.id}
                className="grid h-8 w-8 pointer-coarse:size-11 place-items-center rounded-full text-text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-50"
                onClick={() => void remove(row.id)}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
