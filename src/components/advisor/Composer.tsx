"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { AdvisorQuota, SuggestionQuery } from "@/lib/advisor/types";

const HINT_TONE = { good: "text-success", warn: "text-warning", neutral: "text-text-muted" } as const;

/** Preguntas listas para tocar: cada una trae, si se pudo calcular, el dato de adelanto. */
export function SuggestionChips({ items, disabled, onPick }: { items: SuggestionQuery[]; disabled: boolean; onPick: (s: SuggestionQuery) => void }) {
  if (items.length === 0) return null;
  return (
    <ul className="advisor-chips" aria-label="Preguntas sugeridas">
      {items.map((s) => (
        <li key={`${s.intent}:${s.label}`} className="shrink-0">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            className={cn(
              "flex max-w-full items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 text-left text-sm font-medium text-text shadow-pop",
              "transition-[transform,background-color,border-color] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.97]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:pointer-events-none disabled:opacity-50",
              "[@media(hover:hover)]:hover:border-accent/40 [@media(hover:hover)]:hover:bg-accent-soft"
            )}
          >
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            {s.hint && <span className={cn("shrink-0 text-xs font-semibold", HINT_TONE[s.tone ?? "neutral"])}>{s.hint}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Composer({
  disabled,
  quota,
  placeholder,
  returnTo,
  onSend,
}: {
  disabled: boolean;
  quota: AdvisorQuota | null;
  placeholder: string;
  returnTo: string;
  onSend: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const blocked = quota?.requiresAccount === true;

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = value.trim();
    if (!text || disabled || blocked) return;
    onSend(text);
    setValue("");
  }

  const next = encodeURIComponent(returnTo);

  return (
    <div className="flex flex-col gap-2">
      {blocked ? (
        <div className="flex flex-wrap items-center gap-2 rounded-media bg-accent-soft px-4 py-3 text-sm text-text">
          <span className="min-w-0 flex-1">Usaste tus {quota?.limit} preguntas gratis. Con una cuenta seguís sin límites.</span>
          <Link href={`/crear-cuenta?callbackUrl=${next}`} className="rounded-full bg-accent px-3.5 py-1.5 text-sm font-semibold text-accent-contrast active:scale-[0.97]">
            Crear cuenta
          </Link>
          <Link href={`/ingresar?callbackUrl=${next}`} className="rounded-full px-3 py-1.5 text-sm font-semibold text-accent hover:underline">
            Ingresar
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="flex items-center gap-2 rounded-full border border-border bg-surface py-1.5 pl-5 pr-1.5 shadow-card focus-within:border-accent/50">
          <label htmlFor="advisor-input" className="sr-only">
            Tu pregunta
          </label>
          <input
            id="advisor-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={300}
            autoComplete="off"
            enterKeyHint="send"
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-text outline-none placeholder:text-text-muted"
          />
          <button
            type="submit"
            disabled={disabled || value.trim() === ""}
            aria-label="Enviar pregunta"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast transition-[transform,opacity] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.94] disabled:opacity-40"
          >
            <ArrowUp className="h-5 w-5" aria-hidden />
          </button>
        </form>
      )}
      {quota && !blocked && (
        <p className="px-2 text-center text-xs text-text-muted">
          Te {quota.remaining === 1 ? "queda" : "quedan"} {quota.remaining} {quota.remaining === 1 ? "pregunta gratis" : "preguntas gratis"} sin cuenta.
        </p>
      )}
    </div>
  );
}
