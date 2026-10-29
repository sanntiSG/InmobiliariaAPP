"use client";

import { MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatRelativeTime } from "@/lib/utils/format";
import { MAIL_CATEGORY_LABELS } from "@/lib/mail/constants";
import { asksSummary, holdText, rowLabel, type RowTone } from "@/lib/mail/inbox-meta";
import type { MailListItem } from "@/lib/mail/messages";

/** Colores por tono: el punto de la izquierda, la etiqueta y el texto de "qué hacer". */
export const ROW_TONE: Record<RowTone, { dot: string; chip: string; hint: string }> = {
  action: { dot: "bg-accent", chip: "bg-accent-soft text-accent", hint: "text-accent" },
  warn: { dot: "bg-warning", chip: "bg-warning-soft text-warning", hint: "text-warning" },
  danger: { dot: "bg-danger", chip: "bg-danger-soft text-danger", hint: "text-danger" },
  done: { dot: "bg-success", chip: "bg-success-soft text-success", hint: "text-text-muted" },
  quiet: { dot: "bg-text-muted/40", chip: "bg-surface-2 text-text-muted", hint: "text-text-muted" },
};

/**
 * Una fila de la bandeja. Dice de un vistazo QUÉ le pasó al mail (la etiqueta de color), QUÉ hay que hacer (la línea de abajo) y, si
 * el cliente hizo varias preguntas, cómo van (contestadas, faltan cargar, para una persona). Si es una conversación de varios mails,
 * lo avisa. El punto de la izquierda lleva el mismo color que la etiqueta: se lee la bandeja entera sin leer el texto.
 */
export function MailRow({ item, mode = "list", onOpen }: { item: MailListItem; mode?: "list" | "ignored"; onOpen: (id: string) => void }) {
  const meta = rowLabel(item);
  const tone = ROW_TONE[meta.tone];
  const asks = asksSummary(item.asks);
  const hold = item.status === "awaiting_confirmation" ? holdText(item.holdCode) : null;
  return (
    <li>
      <button type="button" onClick={() => onOpen(item.id)} className="flex w-full gap-3 px-4 py-3.5 text-left transition-colors duration-150 hover:bg-surface-2/70 active:bg-surface-2">
        <span aria-hidden className={cn("mt-[7px] size-2 shrink-0 rounded-full", tone.dot)} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm font-semibold text-text">{item.from.name || item.from.email}</span>
            <span className="shrink-0 text-xs text-text-muted">{formatRelativeTime(item.receivedAt)}</span>
          </span>
          <span className="truncate text-sm text-text">{item.subject || "(sin asunto)"}</span>
          {mode === "ignored" && item.reason ? <span className="line-clamp-2 text-xs text-text-muted">{item.reason}</span> : item.snippet && <span className="line-clamp-1 text-xs text-text-muted">{item.snippet}</span>}
          {meta.hint && mode !== "ignored" && <span className={cn("text-xs font-medium", tone.hint)}>{meta.hint}</span>}
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className={cn("rounded-pill px-2 py-0.5 text-[11px] font-semibold", tone.chip)}>{meta.label}</span>
            <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-muted">{MAIL_CATEGORY_LABELS[item.category]}</span>
            {asks && <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-muted">{asks}</span>}
            {hold && <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-muted">No salió sola: {hold.toLowerCase()}</span>}
            {item.threadCount > 1 && (
              <span className="inline-flex items-center gap-1 rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-muted">
                <MessagesSquare className="h-3 w-3" aria-hidden /> {item.threadCount} mails
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}
