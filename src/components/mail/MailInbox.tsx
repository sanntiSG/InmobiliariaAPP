"use client";

import { Inbox, Search, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { MailOverview } from "@/lib/mail/overview";
import { SUBS_BY_GROUP, type MailGroup, type MailSub } from "@/lib/mail/groups";
import type { MailListItem } from "@/lib/mail/messages";
import { MailRow, ROW_TONE } from "./MailRow";
import type { RowTone } from "@/lib/mail/inbox-meta";

const GROUPS: { id: MailGroup; label: string }[] = [
  { id: "attention", label: "Necesita tu atención" },
  { id: "answered", label: "Respondidos" },
  { id: "ignored", label: "Ignorados" },
];

const SUB_LABELS: Record<MailSub, string> = {
  all: "Todos",
  confirm: "Para confirmar",
  doubts: "Dudas",
  unsure: "No entendidos",
  errors: "Con error",
  auto: "Solos",
  person: "Por una persona",
};

/** Lo que se ve cuando no hay nada: dice POR QUÉ está vacío y, si es una buena noticia, lo dice. */
function emptyText(group: MailGroup, sub: MailSub, query: string): string {
  if (query.trim().length >= 2) return `No encontré mails con «${query.trim()}». Probá con el nombre, el correo o una palabra del asunto.`;
  if (group === "attention") {
    return sub === "confirm"
      ? "No hay respuestas esperando tu confirmación."
      : sub === "doubts"
        ? "No hay dudas pendientes: todo lo que te consultaron está atendido."
        : sub === "unsure"
          ? "El agente entendió todo lo que llegó."
          : sub === "errors"
            ? "No hay envíos con error."
            : "No tenés nada pendiente: todo lo que llegó está atendido.";
  }
  if (group === "answered") return sub === "auto" ? "Todavía no se respondió nada solo." : sub === "person" ? "Todavía no enviaste ninguna respuesta a mano." : "Todavía no se envió ninguna respuesta.";
  return "No ignoré ningún mail todavía. Acá aparecen los que no eran consultas.";
}

type Props = {
  counts: MailOverview["counts"];
  group: MailGroup;
  sub: MailSub;
  query: string;
  /** `null` = todavía cargando. */
  items: MailListItem[] | null;
  onGroup: (g: MailGroup) => void;
  onSub: (s: MailSub) => void;
  onQuery: (q: string) => void;
  onOpen: (id: string) => void;
  /** Se muestra debajo cuando no hay nada y el agente todavía no recibió ningún mail (la guía para probar con un mail real). */
  emptyExtra?: React.ReactNode;
};

/**
 * La bandeja del agente de correo organizada por lo que hay que hacer: arriba un resumen con lo que espera una persona (cada número es
 * un atajo), después los tres grupos (necesita tu atención · respondidos · ignorados), un buscador y la lista, con los mails de una
 * misma conversación juntos. Antes eran cuatro pestañas que se pisaban (una duda estaba en dos) y no había cómo buscar.
 */
export function MailInbox({ counts, group, sub, query, items, onGroup, onSub, onQuery, onOpen, emptyExtra }: Props) {
  const cards: { id: MailSub; label: string; n: number; tone: RowTone }[] = [
    { id: "confirm", label: "Para confirmar", n: counts.awaiting, tone: "action" },
    { id: "doubts", label: "Dudas sin responder", n: counts.human, tone: "warn" },
    { id: "unsure", label: "No entendidos", n: counts.unsure, tone: "warn" },
    { id: "errors", label: "Con error", n: counts.failed, tone: "danger" },
  ];
  const groupCount: Record<MailGroup, number> = { attention: counts.attention, answered: counts.answered, ignored: counts.ignored };
  const subs = SUBS_BY_GROUP[group];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* Resumen: lo que espera a una persona. Tocar un número abre esa lista. */}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Resumen de lo pendiente">
        {cards.map((c) => {
          const on = group === "attention" && sub === c.id;
          const live = c.n > 0;
          return (
            <li key={c.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => {
                  onGroup("attention");
                  onSub(c.id);
                }}
                className={cn(
                  "flex min-h-[72px] w-full flex-col items-start justify-between gap-1 rounded-card px-3.5 py-3 text-left shadow-pop transition-[transform,box-shadow,background-color] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.97]",
                  on ? "bg-accent text-accent-contrast" : "bg-surface hover:shadow-none"
                )}
              >
                <span className={cn("font-mono text-2xl font-semibold leading-none", on ? "text-accent-contrast" : live ? ROW_TONE[c.tone].hint : "text-text-muted")}>{c.n}</span>
                <span className={cn("text-xs font-medium", on ? "text-accent-contrast/90" : "text-text-muted")}>{c.label}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div role="tablist" aria-label="Grupos de mails" className="flex flex-wrap gap-1.5">
        {GROUPS.map((g) => {
          const on = group === g.id;
          const n = groupCount[g.id];
          return (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                onGroup(g.id);
                onSub("all");
              }}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-pill px-4 py-2 text-sm font-medium transition-[background-color,color,transform] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.97]",
                on ? "bg-accent text-accent-contrast" : "bg-surface text-text-muted shadow-pop hover:text-text"
              )}
            >
              {g.label}
              {n > 0 && <span className={cn("rounded-full px-1.5 text-[11px] font-semibold", on ? "bg-accent-contrast/20" : "bg-surface-2")}>{n > 99 ? "99+" : n}</span>}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {subs.length > 2 || group === "answered" ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar dentro del grupo">
            {subs.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={sub === s}
                onClick={() => onSub(s)}
                className={cn(
                  "inline-flex h-9 items-center rounded-pill border px-3 text-[13px] font-medium transition-colors duration-150 pointer-coarse:h-11",
                  sub === s ? "border-accent/30 bg-accent-soft text-accent" : "border-border-hi bg-surface text-text-muted hover:text-text"
                )}
              >
                {SUB_LABELS[s]}
              </button>
            ))}
          </div>
        ) : null}
        <label className="relative min-w-0 sm:ml-auto sm:w-64">
          <span className="sr-only">Buscar en los mails</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            maxLength={60}
            placeholder="Buscar por nombre, correo o asunto"
            className="h-11 w-full rounded-pill border border-border-hi bg-surface pl-10 pr-10 text-sm text-text outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-text-muted focus:border-accent/60 focus:ring-[3px] focus:ring-accent/15"
          />
          {query && (
            <button type="button" onClick={() => onQuery("")} aria-label="Borrar la búsqueda" className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-text-muted hover:text-text">
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </label>
      </div>

      {items === null ? (
        <p className="text-sm text-text-muted" role="status">
          Cargando…
        </p>
      ) : items.length === 0 ? (
        <>
          <p className="flex items-start gap-3 rounded-card bg-surface p-5 text-sm text-text-muted shadow-card" role="status">
            <Inbox className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            {emptyText(group, sub, query)}
          </p>
          {emptyExtra}
        </>
      ) : (
        <ul className="swap-in flex flex-col divide-y divide-border overflow-hidden rounded-card bg-surface shadow-card">
          {items.map((m) => (
            <MailRow key={m.id} item={m} mode={group === "ignored" ? "ignored" : "list"} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </div>
  );
}
