"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Check, Mail, MessagesSquare, RefreshCw, Send, ShieldAlert, Trash2, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/utils/cn";
import { formatRelativeTime } from "@/lib/utils/format";
import { INQUIRY_CATEGORIES, MAIL_CATEGORY_LABELS } from "@/lib/mail/constants";
import { holdText } from "@/lib/mail/inbox-meta";
import type { MailOverview } from "@/lib/mail/overview";
import type { MailDetail, MailGroup, MailListItem, MailSub } from "@/lib/mail/messages";
import { MailAnalystPanel } from "./MailAnalystPanel";
import { MailInbox } from "./MailInbox";
import { MailSetupNotice, setupState } from "./MailSetupNotice";
import { MailRealTestGuide, MailTryOut } from "./MailTryOut";
import { mailApi, MailApiError } from "./mail-api";

/** Los temas que se pueden corregir a mano en una consulta ("no era precio, era visita"). */
const TOPIC_CHOICES: { id: (typeof INQUIRY_CATEGORIES)[number]; label: string }[] = INQUIRY_CATEGORIES.map((id) => ({ id, label: MAIL_CATEGORY_LABELS[id] }));

/** Dónde queda un mail en la bandeja (para abrir el grupo correcto cuando se llega desde una notificación). */
function locate(d: { status: string; humanState: string; uncertain: boolean }): { group: MailGroup; sub: MailSub } {
  if (d.status === "ignored" || d.status === "discarded") return { group: "ignored", sub: "all" };
  if (d.status === "failed") return { group: "attention", sub: "errors" };
  if (d.status === "awaiting_confirmation") return { group: "attention", sub: d.uncertain ? "unsure" : d.humanState === "pending" ? "doubts" : "confirm" };
  return d.humanState === "pending" ? { group: "attention", sub: "doubts" } : { group: "answered", sub: "all" };
}

const confidenceText = (c: number) => (c >= 0.8 ? "alta" : c >= 0.6 ? "media" : "baja");

/** Cada cuánto se vuelve a mirar la bandeja sola mientras la pantalla está abierta (sin tocar nada). */
const AUTO_REFRESH_MS = 45_000;

/** "en menos de 1 min" / "en ~3 min" para la próxima revisión automática. */
function formatEta(iso: string): string {
  const minutes = Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000);
  return minutes <= 1 ? "en menos de 1 min" : `en ~${minutes} min`;
}

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
  // Qué se está mirando: el grupo ("necesita tu atención"…), su afinado y la búsqueda (con un momento de espera para no pedir en cada tecla).
  const [group, setGroup] = useState<MailGroup>("attention");
  const [sub, setSub] = useState<MailSub>("all");
  const [queryInput, setQueryInput] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<MailListItem[] | null>(null);
  const [openMail, setOpenMail] = useState<string | null>(openId);
  const [detail, setDetail] = useState<MailDetail | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  /** Lo que se escribe para contestar la duda pendiente (arranca con saludo, tema, cierre y firma). */
  const [followBody, setFollowBody] = useState("");
  const [busy, setBusy] = useState<null | "poll" | "action" | "detail">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const handled = useRef<string | null>(null);
  const aligned = useRef(false);

  const loadOverview = useCallback(async () => {
    const o = await mailApi<MailOverview>("", agencyId);
    setOverview(o);
    onOverview?.(o);
    return o;
  }, [agencyId, onOverview]);

  const view = { group, sub, q };
  const loadList = useCallback(
    async (v: { group: MailGroup; sub: MailSub; q: string }) => {
      const r = await mailApi<{ items: MailListItem[] }>(`/messages?group=${v.group}&sub=${v.sub}${v.q ? `&q=${encodeURIComponent(v.q)}` : ""}`, agencyId);
      setItems(r.items);
    },
    [agencyId]
  );

  // La búsqueda se aplica un momento después de dejar de escribir.
  useEffect(() => {
    const t = setTimeout(() => setQ(queryInput.trim().length >= 2 ? queryInput.trim() : ""), 300);
    return () => clearTimeout(t);
  }, [queryInput]);

  // Carga inicial y al cambiar de grupo, afinado o búsqueda.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const o = await loadOverview();
        if (!alive) return;
        if (o.mailbox) await loadList({ group, sub, q });
        else setItems([]);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "No se pudo cargar el correo.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadOverview, loadList, group, sub, q]);

  // Abrir el detalle de un mail (de una notificación o tocando una fila).
  useEffect(() => {
    if (!openMail || handled.current === openMail) return;
    handled.current = openMail;
    let alive = true;
    (async () => {
      try {
        const d = await mailApi<MailDetail>(`/messages/${openMail}`, agencyId);
        if (!alive) return;
        // Si se llegó desde una notificación, la bandeja de atrás pasa al grupo donde está ese mail.
        if (openMail === openId && !aligned.current) {
          aligned.current = true;
          const where = locate(d);
          setGroup(where.group);
          setSub(where.sub);
        }
        setDetail(d);
        setDraftSubject(d.draft?.subject ?? "");
        setDraftBody(d.draft?.body ?? "");
        setFollowBody(d.followUpStarter);
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : "No pude abrir ese mail.");
          setOpenMail(null);
        }
      }
    })();
    return () => {
      alive = false;
      // Si el efecto se vuelve a correr (modo estricto de desarrollo o cambio de inmobiliaria), tiene que volver a pedir el mail.
      handled.current = null;
    };
  }, [openMail, agencyId, openId]);

  // La revisión de la casilla ocurre sola (cada 5 min, en el servidor): acá sólo se vuelve a leer lo que ya pasó para que lo
  // nuevo aparezca sin tener que tocar "Revisar ahora". Se pausa con la pestaña oculta y mientras se hace otra cosa, y nunca
  // toca el cajón de un mail abierto (no pisa un borrador que se está editando).
  const hasMailbox = Boolean(overview?.mailbox);
  const live = useRef({ loadOverview, loadList, view, busy });
  useEffect(() => {
    live.current = { loadOverview, loadList, view, busy };
  });
  useEffect(() => {
    if (!hasMailbox) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const sync = async () => {
      const { loadOverview: reloadOverview, loadList: reloadList, view: current, busy: working } = live.current;
      if (stopped || working || document.visibilityState !== "visible") return;
      try {
        await Promise.all([reloadOverview(), reloadList(current)]);
      } catch {
        // Un tropiezo de red no es un error para mostrar: el próximo intento lo corrige.
      }
    };
    const loop = () => {
      timer = setTimeout(async () => {
        await sync();
        if (!stopped) loop();
      }, AUTO_REFRESH_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    loop();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hasMailbox]);

  const closeDetail = () => {
    setOpenMail(null);
    setDetail(null);
    handled.current = null;
  };

  const refresh = async () => {
    await Promise.all([loadOverview(), loadList(view)]);
  };

  const pollNow = async () => {
    setBusy("poll");
    setError(null);
    setNotice(null);
    try {
      const r = await mailApi<{ outcome: { seen: number; drafts: number; queued: number; ignored: number; status: string; error?: string }; overview: MailOverview }>("/poll", agencyId, { method: "POST" });
      setOverview(r.overview);
      onOverview?.(r.overview);
      await loadList(view);
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

  const act = async (action: "confirm" | "discard" | "not_inquiry" | "retry" | "was_inquiry") => {
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
          : action === "was_inquiry"
          ? "Listo: lo pasé a “Para confirmar” con la respuesta preparada."
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

  /** Corregir el tema de la consulta ("no era precio, era visita"): se guarda y el agente lo tiene en cuenta en mails dudosos parecidos. */
  const changeTopic = async (topic: (typeof INQUIRY_CATEGORIES)[number]) => {
    if (!detail) return;
    setBusy("action");
    setError(null);
    try {
      await mailApi<{ ok: true; learned: boolean }>(`/messages/${detail.id}`, agencyId, { method: "POST", body: JSON.stringify({ action: "set_topic", topic }) });
      const d = await mailApi<MailDetail>(`/messages/${detail.id}`, agencyId);
      setDetail(d);
      setNotice(`Listo: el tema quedó como «${MAIL_CATEGORY_LABELS[topic]}». El agente lo va a tener en cuenta en mails dudosos parecidos.`);
      await refresh();
    } catch (e) {
      setError(e instanceof MailApiError ? e.message : "No se pudo cambiar el tema.");
    } finally {
      setBusy(null);
    }
  };

  /** Contestar la duda pendiente (sale por el mismo hilo) o darla por resuelta porque se habló por otro medio. */
  const answerDoubt = async (kind: "followup" | "resolve") => {
    if (!detail) return;
    setBusy("action");
    setError(null);
    try {
      const r = await mailApi<{ status?: string; error?: string | null }>(`/messages/${detail.id}`, agencyId, {
        method: "POST",
        body: JSON.stringify(kind === "followup" ? { action: kind, body: followBody } : { action: kind }),
      });
      closeDetail();
      setNotice(
        kind === "resolve"
          ? "Listo: la duda quedó resuelta."
          : r.status === "sent"
            ? "Respuesta enviada: la duda quedó resuelta."
            : r.status === "failed"
              ? `No se pudo enviar: ${r.error ?? "error desconocido"}`
              : "Quedó en cola: sale en unos minutos."
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
      {!mb && setupState(overview) !== "ready" ? (
        <MailSetupNotice overview={overview} agencyId={agencyId} />
      ) : !mb ? (
        <section className="flex flex-col gap-3 rounded-card bg-surface p-5 shadow-card">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent" aria-hidden>
              <Mail className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-display text-base font-bold text-text">{overview.viewerIsAdmin ? "Esta inmobiliaria todavía no conectó su casilla" : "Todavía no conectaste tu casilla"}</h3>
              <p className="mt-0.5 text-sm text-text-muted">
                {overview.viewerIsAdmin ? "La casilla es la que recibe las consultas de sus clientes. " : ""}
                Conectala y voy a leer las consultas que lleguen, entender qué preguntan y dejar la respuesta lista con las propiedades de la inmobiliaria. Sólo leo lo que llegue desde que la conectes.
              </p>
            </div>
          </div>
          {overview.canManage ? (
            onManage ? (
              <button type="button" onClick={onManage} className="inline-flex w-fit items-center gap-1.5 rounded-pill bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-transform active:scale-[0.97]">
                {overview.viewerIsAdmin ? "Conectar la casilla de esta inmobiliaria" : "Conectar mi casilla"} <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            ) : (
              <Link href={connectHref} className="inline-flex w-fit items-center gap-1.5 rounded-pill bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-transform active:scale-[0.97]">
                {overview.viewerIsAdmin ? "Conectar la casilla de esta inmobiliaria" : "Conectar mi casilla"} <ArrowRight className="h-4 w-4" aria-hidden />
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
                {attention ? "Necesita atención" : "Conectada"} · {mb.lastPollAt ? `revisada ${formatRelativeTime(mb.lastPollAt)}` : "todavía sin revisar"} · {overview.settings.mode === "auto" ? "modo automático" : "modo con confirmación: las respuestas esperan tu OK"}
              </span>
              {!attention && mb.status === "active" && mb.nextAutoCheckAt && (
                <span className="block text-xs text-text-muted">Próxima revisión automática {formatEta(mb.nextAutoCheckAt)}. Esta pantalla se actualiza sola.</span>
              )}
            </span>
            <Button size="sm" variant="secondary" disabled={busy !== null || mb.status === "paused"} onClick={pollNow}>
              <RefreshCw className={cn("h-4 w-4", busy === "poll" && "animate-spin")} aria-hidden />
              {busy === "poll" ? "Revisando…" : "Revisar ahora"}
            </Button>
            {overview.canManage &&
              (onManage ? (
                <button type="button" onClick={onManage} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent hover:underline">
                  Configurar
                </button>
              ) : (
                <Link href={connectHref} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent hover:underline">
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

      {!mb && <MailTryOut agencyId={agencyId} defaultOpen />}

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
          {/* Resumen y recomendaciones con opciones fijas (no es un chat), y debajo la bandeja por lo que hay que hacer. */}
          <MailAnalystPanel agencyId={agencyId} />
          <MailInbox
            counts={overview.counts}
            group={group}
            sub={sub}
            query={queryInput}
            items={items}
            onGroup={(g) => {
              setItems(null);
              setGroup(g);
            }}
            onSub={(x) => {
              setItems(null);
              setSub(x);
            }}
            onQuery={(x) => {
              setItems(null);
              setQueryInput(x);
            }}
            onOpen={setOpenMail}
            emptyExtra={group === "attention" && sub === "all" && q === "" && Object.values(overview.counts).every((n) => n === 0) ? <MailRealTestGuide agencyId={agencyId} email={mb.email} /> : null}
          />
        </>
      )}

      {mb && <MailTryOut agencyId={agencyId} />}

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

            {detail.humanState === "pending" && (
              <section aria-label="Falta tu respuesta" className="flex flex-col gap-3 rounded-media bg-warning-soft p-4">
                <h3 className="flex items-center gap-2 font-display text-sm font-bold text-text">
                  <UserRoundCheck className="h-4 w-4 shrink-0 text-warning" aria-hidden />
                  Falta la respuesta de una persona
                </h3>
                <ul className="flex flex-col gap-1 text-sm text-text">
                  {detail.repliedToAuto && <li>Contestó un correo automático: posiblemente quiere hablar con una persona.</li>}
                  {detail.humanTopics.length > 0 && <li>Preguntó sobre {detail.humanTopics.join(", ")}.</li>}
                  {detail.missingData > 0 && <li>Preguntó algo que la publicación no tiene cargado.</li>}
                  {detail.status === "sent" && <li>Ya se le respondió con lo que se sabía; falta lo demás.</li>}
                </ul>
                {detail.status === "sent" ? (
                  <>
                    <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
                      Tu respuesta (sale en el mismo hilo del mail)
                      <textarea
                        value={followBody}
                        onChange={(e) => setFollowBody(e.target.value)}
                        maxLength={6000}
                        rows={9}
                        className="resize-y rounded-media border border-border bg-surface px-3 py-2.5 text-sm leading-relaxed text-text outline-none focus:border-accent/60"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={busy !== null || followBody.trim().length < 3} onClick={() => answerDoubt("followup")}>
                        <Send className="h-4 w-4" aria-hidden />
                        {busy === "action" ? "Enviando…" : "Enviar mi respuesta"}
                      </Button>
                      <Button variant="ghost" disabled={busy !== null} onClick={() => answerDoubt("resolve")}>
                        Ya lo resolví por otro medio
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col gap-2">
                    {editable && <p className="text-sm text-text">Editá la respuesta de abajo con lo que corresponda y enviala: la duda queda resuelta.</p>}
                    <div>
                      <Button variant="ghost" disabled={busy !== null} onClick={() => answerDoubt("resolve")}>
                        Ya lo resolví por otro medio
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            )}
            {detail.humanState === "resolved" && (
              <p className="flex items-center gap-2 text-sm text-text-muted">
                <Check className="h-4 w-4 text-success" aria-hidden />
                La duda de este cliente ya está resuelta.
              </p>
            )}
            {detail.followUps.length > 0 && (
              <section aria-label="Lo que contestó el equipo" className="flex flex-col gap-2">
                <h3 className="font-display text-sm font-bold text-text">Lo que contestó el equipo</h3>
                <ul className="flex flex-col gap-2">
                  {detail.followUps.map((f) => (
                    <li key={f.id} className="rounded-media bg-surface-2 p-3.5 text-sm text-text">
                      <p className="mb-1.5 text-xs text-text-muted">
                        {f.status === "sent" ? "Enviada" : f.status === "failed" ? "No se pudo enviar" : "En cola"} · {formatRelativeTime(f.at)}
                        {f.status === "failed" && f.error ? ` · ${f.error}` : ""}
                      </p>
                      <p className="whitespace-pre-wrap break-words">{f.body}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-label="Por qué lo detecté" className="flex flex-col gap-2">
              <h3 className="font-display text-sm font-bold text-text">{detail.status === "ignored" ? "Por qué lo ignoré" : "Por qué lo detecté así"}</h3>
              <ul className="flex flex-wrap gap-1.5">
                <li className="rounded-pill bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">{MAIL_CATEGORY_LABELS[detail.category]}</li>
                {detail.reasons
                  .filter((r) => !(editable && r.startsWith("No salió sola: ")))
                  .map((r) => (
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
              {detail.needsHuman && editable && detail.humanState !== "pending" && (
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

            {editable && (detail.holdCode || detail.reasons.some((r) => r.startsWith("No salió sola: "))) && (
              <p role="status" className="flex items-start gap-2 rounded-media bg-warning-soft px-3.5 py-3 text-sm text-text">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                <span>
                  {overview.settings.mode === "auto" ? "Está en modo automático, pero esta respuesta " : "Esta respuesta "}
                  <strong className="font-semibold">no salió sola</strong>
                  {detail.holdCode ? `: ${holdText(detail.holdCode)?.toLowerCase()}.` : `: ${detail.reasons.find((r) => r.startsWith("No salió sola: "))!.slice("No salió sola: ".length)}`}
                  {detail.holdCode && detail.reasons.find((r) => r.startsWith("No salió sola: ")) ? ` ${detail.reasons.find((r) => r.startsWith("No salió sola: "))!.slice("No salió sola: ".length)}` : ""}
                </span>
              </p>
            )}

            {detail.askList.length > 0 && (
              <section aria-label="Qué preguntó" className="flex flex-col gap-2">
                <h3 className="font-display text-sm font-bold text-text">Qué preguntó y cómo quedó cada cosa</h3>
                <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-media bg-surface-2">
                  {detail.askList.map((a, i) => {
                    const property = detail.properties.find((p) => p.id === a.propertyId);
                    const state =
                      a.state === "answered"
                        ? { text: "Contestada", cls: "bg-success-soft text-success" }
                        : a.state === "missing"
                          ? { text: "Falta cargar el dato", cls: "bg-warning-soft text-warning" }
                          : { text: "Para una persona", cls: "bg-warning-soft text-warning" };
                    return (
                      <li key={`${a.key}-${a.propertyId ?? "x"}-${i}`} className="flex items-start justify-between gap-3 px-3.5 py-2.5 text-sm">
                        <span className="min-w-0 text-text">
                          <span className="font-medium">{a.key === "other" ? a.label : a.label.charAt(0).toUpperCase() + a.label.slice(1)}</span>
                          {property && detail.properties.length > 1 && <span className="block truncate text-xs text-text-muted">{property.title}</span>}
                        </span>
                        <span className={cn("shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-semibold", state.cls)}>{state.text}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {detail.thread.length > 0 && (
              <section aria-label="Otros mails de esta conversación" className="flex flex-col gap-2">
                <h3 className="flex items-center gap-2 font-display text-sm font-bold text-text">
                  <MessagesSquare className="h-4 w-4 text-text-muted" aria-hidden /> Otros mails de esta conversación
                </h3>
                <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-media bg-surface-2">
                  {detail.thread.map((t) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => setOpenMail(t.id)} className="flex w-full items-baseline justify-between gap-3 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-surface-3">
                        <span className="min-w-0 truncate text-text">{t.subject || "(sin asunto)"}</span>
                        <span className="shrink-0 text-xs text-text-muted">{formatRelativeTime(t.receivedAt)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {INQUIRY_CATEGORIES.includes(detail.category as (typeof INQUIRY_CATEGORIES)[number]) && detail.text && (
              <section aria-label="Tema" className="flex flex-col gap-2">
                <h3 className="font-display text-sm font-bold text-text">¿Era otro tema?</h3>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Corregir el tema">
                  {TOPIC_CHOICES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={detail.category === t.id}
                      disabled={busy !== null || detail.category === t.id}
                      onClick={() => void changeTopic(t.id)}
                      className={cn(
                        "inline-flex min-h-9 items-center rounded-pill border px-3 text-[13px] font-medium transition-colors pointer-coarse:min-h-11",
                        detail.category === t.id ? "border-accent/30 bg-accent-soft text-accent" : "border-border-hi bg-surface text-text-muted hover:text-text"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-text-muted">{detail.correctedTopic ? "Ya lo corregiste a mano. " : ""}Si lo cambiás, el agente lo tiene en cuenta en mails dudosos parecidos (nunca lo hace salir solo).</p>
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
              {detail.status === "ignored" && detail.text && (
                <Button disabled={busy !== null} onClick={() => act("was_inquiry")}>
                  <UserRoundCheck className="h-4 w-4" aria-hidden />
                  {busy === "action" ? "Preparando…" : "Era una consulta"}
                </Button>
              )}
              {detail.status === "ignored" && !detail.text && <p className="text-xs text-text-muted">De este mail no guardé el texto, así que no puedo prepararte una respuesta.</p>}
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
