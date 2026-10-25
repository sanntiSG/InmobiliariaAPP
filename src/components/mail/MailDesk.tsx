"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Check, Inbox, Mail, RefreshCw, Send, ShieldAlert, Trash2, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/utils/cn";
import { formatRelativeTime } from "@/lib/utils/format";
import { MAIL_CATEGORY_LABELS, MAIL_STATUS_LABELS } from "@/lib/mail/constants";
import type { MailOverview } from "@/lib/mail/overview";
import type { MailDetail, MailListItem, MailTab } from "@/lib/mail/messages";
import { mailApi, MailApiError } from "./mail-api";

const TABS: { id: MailTab; label: string; empty: string }[] = [
  { id: "confirm", label: "Para confirmar", empty: "No hay respuestas esperando tu confirmación." },
  { id: "sent", label: "Enviados", empty: "Todavía no se envió ninguna respuesta." },
  { id: "ignored", label: "Ignorados", empty: "No ignoré ningún mail todavía. Acá aparecen los que no eran consultas." },
];

const confidenceText = (c: number) => (c >= 0.8 ? "alta" : c >= 0.6 ? "media" : "baja");

/**
 * El escritorio del agente de correo: cómo está la casilla, las respuestas que esperan confirmación, lo que ya se envió y lo
 * que se ignoró. Cada mail se abre en un cajón con el texto de quien escribió, por qué el agente lo entendió así y la
 * respuesta preparada, que se puede cambiar antes de enviar. No es un chat: son pasos concretos sobre cosas concretas.
 */
export function MailDesk({
  agencyId,
  layer = "page",
  connectHref = "/dashboard/agentes/correo",
  onManage,
  openId = null,
  onOverview,
}: {
  agencyId: string | null;
  layer?: "page" | "overlay";
  /** Dónde se conecta la casilla y se configura el agente (si la pantalla no lo resuelve sola con `onManage`). */
  connectHref?: string;
  /** Si viene, "Conectar" y "Configurar" son botones que llaman a esto en lugar de enlaces. */
  onManage?: () => void;
  /** Un mail para abrir apenas carga (viene de una notificación). */
  openId?: string | null;
  onOverview?: (o: MailOverview) => void;
}) {
  const [overview, setOverview] = useState<MailOverview | null>(null);
  const [tab, setTab] = useState<MailTab>("confirm");
  const [items, setItems] = useState<MailListItem[] | null>(null);
  const [openMail, setOpenMail] = useState<string | null>(openId);
  const [detail, setDetail] = useState<MailDetail | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [busy, setBusy] = useState<null | "poll" | "action" | "detail">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const handled = useRef<string | null>(null);

  const loadOverview = useCallback(async () => {
    const o = await mailApi<MailOverview>("", agencyId);
    setOverview(o);
    onOverview?.(o);
    return o;
  }, [agencyId, onOverview]);

  const loadList = useCallback(
    async (which: MailTab) => {
      const r = await mailApi<{ items: MailListItem[] }>(`/messages?tab=${which}`, agencyId);
      setItems(r.items);
    },
    [agencyId]
  );

  // Carga inicial y al cambiar de pestaña.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const o = await loadOverview();
        if (!alive) return;
        if (o.mailbox) await loadList(tab);
        else setItems([]);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "No se pudo cargar el correo.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadOverview, loadList, tab]);

  // Abrir el detalle de un mail (de una notificación o tocando una fila).
  useEffect(() => {
    if (!openMail || handled.current === openMail) return;
    handled.current = openMail;
    let alive = true;
    (async () => {
      try {
        const d = await mailApi<MailDetail>(`/messages/${openMail}`, agencyId);
        if (!alive) return;
        setDetail(d);
        setDraftSubject(d.draft?.subject ?? "");
        setDraftBody(d.draft?.body ?? "");
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : "No pude abrir ese mail.");
          setOpenMail(null);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [openMail, agencyId]);

  const closeDetail = () => {
    setOpenMail(null);
    setDetail(null);
    handled.current = null;
  };

  const refresh = async (which: MailTab = tab) => {
    await Promise.all([loadOverview(), loadList(which)]);
  };

  const pollNow = async () => {
    setBusy("poll");
    setError(null);
    setNotice(null);
    try {
      const r = await mailApi<{ outcome: { seen: number; drafts: number; queued: number; ignored: number; status: string; error?: string }; overview: MailOverview }>("/poll", agencyId, { method: "POST" });
      setOverview(r.overview);
      onOverview?.(r.overview);
      await loadList(tab);
      const o = r.outcome;
      setNotice(
        o.status === "busy"
          ? "Ya se está revisando. Probá en un momento."
          : o.error
            ? o.error
            : o.seen === 0
              ? "Revisé la casilla: no hay mails nuevos."
              : `Revisé ${o.seen} ${o.seen === 1 ? "mail nuevo" : "mails nuevos"}: ${o.drafts} para confirmar, ${o.queued} respondidos, ${o.ignored} ignorados.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo revisar ahora.");
    } finally {
      setBusy(null);
    }
  };

  const act = async (action: "confirm" | "discard" | "not_inquiry" | "retry") => {
    if (!detail) return;
    setBusy("action");
    setError(null);
    try {
      const r = await mailApi<{ status: string; error?: string | null; blocked?: boolean }>(`/messages/${detail.id}`, agencyId, {
        method: "POST",
        body: JSON.stringify(action === "confirm" ? { action, subject: draftSubject, body: draftBody } : { action }),
      });
      closeDetail();
      setNotice(
        action === "discard"
          ? "Descartada."
          : action === "not_inquiry"
            ? r.blocked
              ? "Listo: no era una consulta. Como pasó dos veces, no le voy a responder más a esa persona."
              : "Listo: no era una consulta."
            : r.status === "sent"
              ? "Respuesta enviada."
              : r.status === "failed"
                ? `No se pudo enviar: ${r.error ?? "error desconocido"}`
                : "Confirmada. Sale en unos minutos."
      );
      await refresh();
    } catch (e) {
      setError(e instanceof MailApiError ? e.message : "No se pudo completar la acción.");
    } finally {
      setBusy(null);
    }
  };

  if (error && !overview) {
    return (
      <p role="alert" className="max-w-xl rounded-media bg-danger-soft px-4 py-3 text-sm text-text">
        {error}
      </p>
    );
  }
  if (!overview) {
    return (
      <p className="advisor-thinking text-sm text-text-muted" role="status">
        Estoy mirando tu correo
        <span aria-hidden className="advisor-dots">
          <i />
          <i />
          <i />
        </span>
      </p>
    );
  }

  const mb = overview.mailbox;
  const attention = mb && mb.status !== "active";
  const editable = detail?.status === "awaiting_confirmation";

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Estado de la casilla */}
      {!mb ? (
        <section className="flex flex-col gap-3 rounded-card bg-surface p-5 shadow-card">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent" aria-hidden>
              <Mail className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-display text-base font-bold text-text">Todavía no conectaste tu casilla</h3>
              <p className="mt-0.5 text-sm text-text-muted">
                Conectala y voy a leer las consultas que lleguen, entender qué preguntan y dejarte la respuesta lista con tus propiedades. Sólo leo lo que llegue desde que la conectes.
              </p>
            </div>
          </div>
          {overview.canManage ? (
            onManage ? (
              <button type="button" onClick={onManage} className="inline-flex w-fit items-center gap-1.5 rounded-pill bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-transform active:scale-[0.97]">
                Conectar mi casilla <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            ) : (
              <Link href={connectHref} className="inline-flex w-fit items-center gap-1.5 rounded-pill bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-transform active:scale-[0.97]">
                Conectar mi casilla <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )
          ) : (
            <p className="text-sm text-text-muted">La conexión la hace el dueño de la inmobiliaria.</p>
          )}
        </section>
      ) : (
        <section className={cn("flex flex-col gap-3 rounded-card p-4 shadow-card", attention ? "bg-warning-soft" : "bg-surface")}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="min-w-0 flex-1 basis-48">
              <span className="block truncate text-sm font-semibold text-text">{mb.email}</span>
              <span className="block text-xs text-text-muted">
                {attention ? "Necesita atención" : "Conectada"} · {mb.lastPollAt ? `revisada ${formatRelativeTime(mb.lastPollAt)}` : "todavía sin revisar"} · modo {overview.settings.mode === "auto" ? "automático" : "con confirmación"}
              </span>
            </span>
            <Button size="sm" variant="secondary" disabled={busy !== null || mb.status === "paused"} onClick={pollNow}>
              <RefreshCw className={cn("h-4 w-4", busy === "poll" && "animate-spin")} aria-hidden />
              {busy === "poll" ? "Revisando…" : "Revisar ahora"}
            </Button>
            {overview.canManage &&
              (onManage ? (
                <button type="button" onClick={onManage} className="text-sm font-semibold text-accent hover:underline">
                  Configurar
                </button>
              ) : (
                <Link href={connectHref} className="text-sm font-semibold text-accent hover:underline">
                  Configurar
                </Link>
              ))}
          </div>
          {attention && (
            <p className="flex items-start gap-2 text-sm text-text">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              <span>
                {mb.lastError ?? "No pude revisar la casilla."} {overview.canManage ? "Reconectala desde Configurar." : "Avisale al dueño de la inmobiliaria."}
              </span>
            </p>
          )}
          {!overview.sendEnabled && (
            <p className="text-xs text-text-muted">Las respuestas confirmadas las envía el servidor principal: pueden tardar unos minutos en salir.</p>
          )}
        </section>
      )}

      {notice && (
        <p role="status" className="rounded-media bg-accent-soft px-4 py-3 text-sm text-text">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-media bg-danger-soft px-4 py-3 text-sm text-text">
          {error}
        </p>
      )}

      {mb && (
        <>
          <div role="tablist" aria-label="Mails" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {TABS.map((t) => {
              const count = t.id === "confirm" ? overview.counts.awaiting : t.id === "sent" ? overview.counts.sent + overview.counts.queued + overview.counts.failed : overview.counts.ignored;
              const on = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => {
                    setItems(null);
                    setTab(t.id);
                  }}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-pill px-4 py-2 text-sm font-medium transition-[background-color,color,transform] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.97]",
                    on ? "bg-accent text-accent-contrast" : "bg-surface text-text-muted shadow-pop hover:text-text"
                  )}
                >
                  {t.label}
                  {count > 0 && <span className={cn("rounded-full px-1.5 text-[11px] font-semibold", on ? "bg-accent-contrast/20" : "bg-surface-2")}>{count > 99 ? "99+" : count}</span>}
                </button>
              );
            })}
          </div>

          {items === null ? (
            <p className="text-sm text-text-muted" role="status">
              Cargando…
            </p>
          ) : items.length === 0 ? (
            <p className="flex items-start gap-3 rounded-card bg-surface p-5 text-sm text-text-muted shadow-card">
              <Inbox className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              {TABS.find((t) => t.id === tab)!.empty}
            </p>
          ) : (
            <ul className="rise-group flex flex-col divide-y divide-border overflow-hidden rounded-card bg-surface shadow-card">
              {items.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => setOpenMail(m.id)} className="flex w-full flex-col gap-1 px-4 py-3.5 text-left transition-colors duration-150 hover:bg-surface-2/70 active:bg-surface-2">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-semibold text-text">{m.from.name || m.from.email}</span>
                      <span className="shrink-0 text-xs text-text-muted">{formatRelativeTime(m.receivedAt)}</span>
                    </span>
                    <span className="truncate text-sm text-text">{m.subject || "(sin asunto)"}</span>
                    {m.snippet && <span className="line-clamp-1 text-xs text-text-muted">{m.snippet}</span>}
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      <span className="rounded-pill bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">{MAIL_CATEGORY_LABELS[m.category]}</span>
                      {tab === "sent" && (
                        <span className={cn("rounded-pill px-2 py-0.5 text-[11px] font-medium", m.status === "failed" ? "bg-danger-soft text-danger" : "bg-surface-2 text-text-muted")}>
                          {m.auto && m.status === "sent" ? "Enviado automáticamente" : MAIL_STATUS_LABELS[m.status]}
                        </span>
                      )}
                      {m.needsHuman && <span className="rounded-pill bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">Lo tiene que ver una persona</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Sheet open={!!openMail} onClose={closeDetail} title={detail?.subject || "Mail"} side="right" size="lg" layer={layer}>
        {!detail ? (
          <p className="py-6 text-sm text-text-muted" role="status">
            Abriendo…
          </p>
        ) : (
          <div className="flex flex-col gap-5 pb-4">
            <div className="text-sm">
              <p className="font-semibold text-text">{detail.from.name || detail.from.email}</p>
              <p className="text-text-muted">
                {detail.from.name ? `${detail.from.email} · ` : ""}
                {formatRelativeTime(detail.receivedAt)}
                {detail.replyTo && detail.replyTo !== detail.from.email ? ` · se responde a ${detail.replyTo}` : ""}
              </p>
            </div>

            <section aria-label="Por qué lo detecté" className="flex flex-col gap-2">
              <h3 className="font-display text-sm font-bold text-text">Por qué lo detecté así</h3>
              <ul className="flex flex-wrap gap-1.5">
                <li className="rounded-pill bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">{MAIL_CATEGORY_LABELS[detail.category]}</li>
                {detail.reasons.map((r) => (
                  <li key={r} className="rounded-pill bg-surface-2 px-2.5 py-1 text-xs text-text-muted">
                    {r}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-text-muted">Seguridad del agente: {confidenceText(detail.confidence)}.</p>
              {detail.authFailed && (
                <p className="flex items-start gap-2 rounded-media bg-warning-soft px-3 py-2 text-xs text-text">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                  El servidor de quien escribió no pasó las verificaciones del correo: puede no ser quien dice. No respondas sin comprobarlo.
                </p>
              )}
              {detail.needsHuman && (
                <p className="flex items-start gap-2 rounded-media bg-warning-soft px-3 py-2 text-xs text-text">
                  <UserRoundCheck className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                  Hay algo en este mail que tiene que contestar una persona. Revisá la respuesta antes de enviarla.
                </p>
              )}
            </section>

            {detail.text && (
              <section aria-label="Lo que escribió" className="flex flex-col gap-2">
                <h3 className="font-display text-sm font-bold text-text">Lo que escribió</h3>
                <blockquote className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-media bg-surface-2 p-3.5 text-sm text-text">{detail.text}</blockquote>
              </section>
            )}

            {detail.properties.length > 0 && (
              <section aria-label="Propiedades" className="flex flex-col gap-2">
                <h3 className="font-display text-sm font-bold text-text">Propiedades que nombra</h3>
                <ul className="flex flex-wrap gap-1.5">
                  {detail.properties.map((p) => (
                    <li key={p.id}>
                      <Link href={`/propiedades/${p.slug}`} className="inline-flex rounded-pill bg-surface-2 px-2.5 py-1 text-xs font-medium text-text hover:text-accent">
                        {p.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {detail.draft && (
              <section aria-label="Respuesta" className="flex flex-col gap-2">
                <h3 className="font-display text-sm font-bold text-text">{editable ? "La respuesta que preparé" : "La respuesta"}</h3>
                {editable ? (
                  <>
                    <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
                      Asunto
                      <input value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)} maxLength={200} className="rounded-media border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-accent/60" />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
                      Mensaje
                      <textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)} maxLength={6000} rows={14} className="resize-y rounded-media border border-border bg-surface-2 px-3 py-2.5 text-sm leading-relaxed text-text outline-none focus:border-accent/60" />
                    </label>
                  </>
                ) : (
                  <div className="whitespace-pre-wrap break-words rounded-media bg-surface-2 p-3.5 text-sm text-text">
                    <p className="mb-2 text-xs text-text-muted">{detail.draft.subject}</p>
                    {detail.draft.body}
                  </div>
                )}
              </section>
            )}

            {detail.status === "failed" && detail.error && (
              <p role="alert" className="flex items-start gap-2 rounded-media bg-danger-soft px-3 py-2.5 text-sm text-text">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
                {detail.error}
              </p>
            )}
            {(detail.status === "sent" || detail.status === "queued" || detail.status === "sending") && (
              <p className="flex items-center gap-2 text-sm text-text-muted">
                <Check className="h-4 w-4 text-success" aria-hidden />
                {detail.status === "sent" ? `Enviada ${detail.sentAt ? formatRelativeTime(detail.sentAt) : ""}${detail.auto ? " automáticamente" : ""}.` : "Confirmada: sale en unos minutos."}
              </p>
            )}

            <div className="sticky bottom-0 -mx-1 flex flex-wrap gap-2 bg-surface px-1 pt-3">
              {editable && (
                <>
                  <Button disabled={busy !== null || !draftBody.trim() || !draftSubject.trim()} onClick={() => act("confirm")}>
                    <Send className="h-4 w-4" aria-hidden />
                    {busy === "action" ? "Enviando…" : "Enviar respuesta"}
                  </Button>
                  <Button variant="secondary" disabled={busy !== null} onClick={() => act("discard")}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                    Descartar
                  </Button>
                  <Button variant="ghost" disabled={busy !== null} onClick={() => act("not_inquiry")}>
                    No es una consulta
                  </Button>
                </>
              )}
              {detail.status === "failed" && (
                <Button disabled={busy !== null} onClick={() => act("retry")}>
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  Reintentar el envío
                </Button>
              )}
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
