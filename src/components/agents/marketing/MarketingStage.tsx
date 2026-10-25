"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ArrowRight, Download, ImageOff, Palette, RefreshCw, Share2, Sparkles } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useStage } from "@/components/advisor/StageFrame";
import { Step, agencyFromLocation } from "@/components/agents/step-kit";
import { useAdvisorState } from "@/components/advisor/store";
import { MODES, ModeCard } from "@/components/social/ModeCard";
import { PropertyPicker } from "@/components/social/PropertyPicker";
import { useSocialCaption } from "@/components/social/useSocialCaption";
import { useSocialStudio } from "@/components/social/useSocialStudio";
import { cn } from "@/lib/utils/cn";
import { TEMPLATE_META } from "@/lib/social/template-meta";
import type { SocialMode, SocialState, SocialSuggestion } from "@/lib/social/types";
import { GeneratingCard } from "./GeneratingCard";
import { PostResult } from "./PostResult";
import { TemplateThumb } from "./TemplateThumb";
import { useBlobImage } from "./useBlobImage";

/** La última inmobiliaria elegida por el admin (al reabrir sigue en la misma). */
let lastAgencyId: string | null = null;

const clip = (s: string, n = 56) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);

/** Mantiene `true` al menos `ms` desde que empezó: una publicación que sale rápido no hace parpadear la animación. */
function useHold(active: boolean, ms: number): boolean {
  const [held, setHeld] = useState(false);
  const since = useRef(0);
  useEffect(() => {
    if (active) {
      since.current = Date.now();
      const raf = requestAnimationFrame(() => setHeld(true));
      return () => cancelAnimationFrame(raf);
    }
    const t = window.setTimeout(() => setHeld(false), Math.max(0, since.current + ms - Date.now()));
    return () => window.clearTimeout(t);
  }, [active, ms]);
  return active || held;
}

const dockRow = "flex flex-wrap items-center gap-2";

// ─── Elegir inmobiliaria (sólo el admin) ─────────────────────────────────────

function AgencyStep({ onPick }: { onPick: (id: string) => void }) {
  const thread = useRef<HTMLDivElement>(null);
  const [agencies, setAgencies] = useState<{ id: string; name: string }[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [choice, setChoice] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/dashboard/social/agencies", { credentials: "same-origin", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { items: { id: string; name: string }[] }) => setAgencies(d.items))
      .catch(() => !ctrl.signal.aborted && setFailed(true));
    return () => ctrl.abort();
  }, []);

  return (
    <Step
      thread={thread}
      speech="Hola, soy tu agente de marketing. ¿Para qué inmobiliaria preparamos contenido?"
      dock={
        <div className={dockRow}>
          <Button disabled={!choice} onClick={() => onPick(choice)}>
            Continuar
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      }
    >
      <div data-step className="max-w-md">
        {failed ? (
          <p className="text-sm text-danger" role="alert">
            No pude cargar la lista de inmobiliarias. Cerrá y volvé a abrirme.
          </p>
        ) : (
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
            Inmobiliaria
            <select
              value={choice}
              disabled={!agencies}
              onChange={(e) => setChoice(e.target.value)}
              className="h-11 rounded-media border border-border bg-surface px-3.5 text-[15px] text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              <option value="">{agencies ? "Elegí una…" : "Cargando…"}</option>
              {agencies?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </Step>
  );
}

export default function MarketingStage() {
  const s = useAdvisorState();
  const isAdmin = s.account.role === "admin";
  const [agencyId, setAgencyId] = useState<string | null>(isAdmin ? (agencyFromLocation() ?? s.agencyId ?? lastAgencyId) : null);

  if (isAdmin && !agencyId) {
    return (
      <AgencyStep
        onPick={(id) => {
          lastAgencyId = id;
          setAgencyId(id);
        }}
      />
    );
  }
  return (
    <MarketingFlow
      key={agencyId ?? "own"}
      agencyId={isAdmin ? agencyId : null}
      onChangeAgency={isAdmin ? () => setAgencyId(null) : undefined}
      preview={s.preview}
    />
  );
}

type View = "loading" | "failed" | "empty" | "intro" | "mode" | "choose" | "design" | "working" | "ready";

const STEPS = [
  { title: "Elegís cómo trabajar", text: "Automático: yo te propongo una publicación por día. Manual: elegís vos qué propiedad promocionar." },
  { title: "Elegís qué promocionar", text: "Te recomiendo la que mejor viene rindiendo, y vos decidís." },
  { title: "Yo te la preparo", text: "Te dejo la imagen lista para descargar y el texto con los hashtags para copiar." },
] as const;

function MarketingFlow({ agencyId, onChangeAgency, preview }: { agencyId: string | null; onChangeAgency?: () => void; preview: boolean }) {
  const { config, setTalking, setBusyLabel, surprise, userScrolledRef, release } = useStage();
  const { state, busy, error, setError, qs, agencyParam, load, changeMode, generate } = useSocialStudio(agencyId, null);
  const thread = useRef<HTMLDivElement>(null);

  const [introDone, setIntroDone] = useState(false);
  const [choice, setChoice] = useState<SocialMode>("auto");
  const [pending, setPending] = useState<string | null>(null);
  const [changing, setChanging] = useState<null | "design" | "property">(null);
  const [tpl, setTpl] = useState<number | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmManual, setConfirmManual] = useState(false);
  const [madeNow, setMadeNow] = useState(false);
  const [suggestions, setSuggestions] = useState<SocialSuggestion[] | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const cur = state?.current ?? null;
  const imageSrc = cur ? `/api/dashboard/social/image?slot=current&v=${cur.version}${agencyParam}` : null;
  const img = useBlobImage(imageSrc);
  const generating = busy === "generate" || (!!imageSrc && img.status === "loading");
  const working = useHold(generating, 900);

  // ── Vista actual (todo sale del estado del motor y de lo que la persona viene haciendo) ──
  let view: View;
  if (!state) view = busy === "load" ? "loading" : "failed";
  else if (state.properties.length === 0 && !cur) view = "empty";
  else if (state.mode === null) view = introDone ? "mode" : "intro";
  else if (working && !pending && !changing) view = "working";
  else if (pending || changing === "design") view = "design";
  else if (changing === "property" || !cur) view = "choose";
  else view = "ready";

  // ── Texto sugerido de la publicación de hoy ──
  const { caption, state: captionState } = useSocialCaption(cur ? `${cur.propertyId}:${cur.version}` : null, qs);

  // ── Recomendaciones (sólo cuando se va a elegir propiedad) ──
  const needSuggestions = view === "choose";
  useEffect(() => {
    if (!needSuggestions || suggestions) return;
    const ctrl = new AbortController();
    fetch(`/api/dashboard/social/recommend${qs}`, { credentials: "same-origin", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { items: SocialSuggestion[] }) => setSuggestions(d.items))
      .catch(() => !ctrl.signal.aborted && setSuggestions([]));
    return () => ctrl.abort();
  }, [needSuggestions, suggestions, qs]);

  // ── Mascota y desplazamiento ──
  useEffect(() => {
    if (!working) return;
    setTalking(true);
    setBusyLabel("Preparando");
    return () => {
      setTalking(false);
      setBusyLabel(null);
    };
  }, [working, setTalking, setBusyLabel]);

  const prevView = useRef<View>(view);
  useEffect(() => {
    if (prevView.current === "working" && view === "ready") surprise();
    prevView.current = view;
  }, [view, surprise]);

  useEffect(() => {
    userScrolledRef.current = false;
    release(0);
    thread.current?.scrollTo({ top: 0 });
  }, [view, release, userScrolledRef]);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from("[data-step]", { opacity: 0, y: 10, duration: 0.36, ease: "power3.out", stagger: 0.06, delay: 0.05, clearProps: "transform,opacity" });
    },
    { scope: thread, dependencies: [view] }
  );

  // ── Acciones ──
  const run = useCallback(
    async (req: Parameters<typeof generate>[0]) => {
      // Se pasa a la pantalla de "preparando" enseguida; si algo falla se vuelve a donde estaba la persona.
      const keep = { pending, changing };
      setPending(null);
      setChanging(null);
      const ok = await generate(req);
      if (ok) {
        setTpl(null);
        setPhoto(null);
        setMadeNow(true);
      } else {
        setPending(keep.pending);
        setChanging(keep.changing);
      }
      return ok;
    },
    [generate, pending, changing]
  );
  const back = () => {
    setPending(null);
    setChanging(null);
    setTpl(null);
    setPhoto(null);
    setError(null);
  };

  const capped = !!cur && state?.regenLeft === 0;
  const regenNote =
    !cur || !state
      ? ""
      : state.regenLeft === null
        ? "Sin límite de regeneraciones (administrador)."
        : state.regenLeft === 0
          ? "Ya usaste las 3 regeneraciones de hoy. Mañana vuelven a estar disponibles."
          : `Te ${state.regenLeft === 1 ? "queda 1 regeneración" : `quedan ${state.regenLeft} regeneraciones`} hoy.`;

  const fileName = `publicacion-${slug(cur?.title ?? "propiedad")}-${new Date().toISOString().slice(0, 10)}.png`;
  const canShare =
    typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([], "x.png", { type: "image/png" })] });
  const share = async () => {
    if (!img.blob) return;
    try {
      await navigator.share({ files: [new File([img.blob], fileName, { type: "image/png" })], text: caption?.full });
    } catch {
      /* la persona cerró el menú de compartir */
    }
  };

  const errorBanner = error && view !== "failed" && (
    <p data-step role="alert" className="max-w-xl rounded-media bg-danger-soft px-4 py-3 text-sm text-text">
      {error}
    </p>
  );
  const previewNote = preview && (
    <p data-step className="max-w-xl text-xs text-text-muted">
      Modo prueba: lo que prepares se guarda en la inmobiliaria elegida.
    </p>
  );
  const agencyRow = onChangeAgency && (
    <p data-step className="text-xs text-text-muted">
      <button type="button" onClick={onChangeAgency} className="font-semibold text-accent hover:underline">
        Cambiar de inmobiliaria
      </button>
    </p>
  );

  // ─────────────────────────────────────────────────────────────────────────
  const mine = state?.properties.find((p) => p.id === (pending ?? cur?.propertyId));
  const topPick = suggestions?.[0];

  let node: ReactNode;
  switch (view) {
    case "loading":
      node = (
        <Step thread={thread}>
          <p className="advisor-thinking text-sm text-text-muted" role="status">
            Estoy mirando tus propiedades
            <span aria-hidden className="advisor-dots">
              <i />
              <i />
              <i />
            </span>
          </p>
        </Step>
      );
      break;

    case "failed":
      node = (
        <Step
          thread={thread}
          speech="No pude cargar tus publicaciones."
          dock={
            <div className={dockRow}>
              <Button variant="secondary" onClick={() => void load()}>
                Probar de nuevo
              </Button>
            </div>
          }
        >
          {error && (
            <p data-step role="alert" className="text-sm text-text-muted">
              {error}
            </p>
          )}
        </Step>
      );
      break;

    case "empty":
      node = (
        <Step
          thread={thread}
          speech="Todavía no tengo con qué trabajar: necesito al menos una propiedad publicada con fotos."
          dock={
            <div className={dockRow}>
              <Link href="/dashboard/propiedades/nueva" className={buttonClasses("primary", "md")}>
                Cargar una propiedad
              </Link>
            </div>
          }
        >
          <div data-step className="flex max-w-md items-start gap-3 rounded-card bg-surface p-4 text-sm text-text-muted shadow-card">
            <ImageOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <p>Las fotos 360° no se usan para armar las publicaciones: hace falta al menos una foto común.</p>
          </div>
          {agencyRow}
        </Step>
      );
      break;

    case "intro":
      node = (
        <Step
          thread={thread}
          speech={`Hola, soy ${config.name ? `${config.name}, tu` : "tu"} agente de marketing. Te ayudo a preparar la imagen y el texto de tus publicaciones para redes. Te explico cómo trabajamos, es cortito.`}
          dock={
            <div className={dockRow}>
              <Button onClick={() => setIntroDone(true)}>
                Empezar
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          }
        >
          <ol className="flex max-w-xl flex-col gap-3">
            {STEPS.map((st, i) => (
              <li key={st.title} data-step className="flex gap-3.5 rounded-card bg-surface p-4 shadow-card">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft font-mono text-sm font-semibold text-accent" aria-hidden>
                  {i + 1}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="font-display text-base font-bold text-text">{st.title}</span>
                  <span className="text-sm text-text-muted">{st.text}</span>
                </span>
              </li>
            ))}
          </ol>
          {previewNote}
          {agencyRow}
        </Step>
      );
      break;

    case "mode":
      node = (
        <Step
          thread={thread}
          speech="Primero, ¿cómo querés trabajar? Lo podés cambiar cuando quieras."
          dock={
            <div className={dockRow}>
              <Button disabled={busy !== null} onClick={() => void changeMode(choice)}>
                {busy === "mode" ? "Preparando…" : "Continuar"}
              </Button>
              <Button variant="ghost" onClick={() => setIntroDone(false)}>
                Ver de nuevo cómo funciona
              </Button>
            </div>
          }
        >
          <div data-step role="radiogroup" aria-label="Cómo preparar tus publicaciones" className="grid max-w-2xl gap-3 sm:grid-cols-2">
            {MODES.map((m) => (
              <ModeCard key={m.id} mode={m} selected={choice === m.id} onSelect={() => setChoice(m.id)} />
            ))}
          </div>
          {errorBanner}
        </Step>
      );
      break;

    case "choose": {
      const others = suggestions?.slice(1) ?? [];
      node = (
        <Step
          thread={thread}
          speech={
            !state?.current && state?.mode === "auto"
              ? "Todavía no armé la publicación de hoy. ¿La preparo yo?"
              : topPick
                ? `Para hoy te recomiendo «${clip(topPick.title)}». Si te gusta, la preparamos.`
                : "¿Qué propiedad querés promocionar hoy?"
          }
          dock={
            <div className={dockRow}>
              {state?.mode === "auto" && (
                <Button disabled={busy !== null || capped} onClick={() => void run({})}>
                  <Sparkles className="h-4 w-4" aria-hidden />
                  Que elija la plataforma
                </Button>
              )}
              <Button variant={state?.mode === "auto" || topPick ? "secondary" : "primary"} onClick={() => setPickerOpen(true)}>
                {topPick ? "Ver todas mis propiedades" : "Elegir propiedad"}
              </Button>
              {cur && (
                <Button variant="ghost" onClick={back}>
                  Volver
                </Button>
              )}
            </div>
          }
        >
          {suggestions === null && (
            <p data-step className="text-sm text-text-muted" role="status">
              Buscando cuál conviene…
            </p>
          )}
          {topPick && (
            <article data-step className="flex max-w-xl flex-col gap-3 rounded-card bg-surface p-4 shadow-card sm:flex-row sm:items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={topPick.photo} alt="" className="h-28 w-full shrink-0 rounded-media object-cover sm:h-24 sm:w-24" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Recomendada</p>
                <h3 className="font-display text-base font-bold text-text">{topPick.title}</h3>
                <p className="text-sm text-text-muted">{topPick.note}</p>
                <div className="mt-1">
                  <Button size="sm" disabled={busy !== null} onClick={() => setPending(topPick.id)}>
                    Preparar esta
                  </Button>
                </div>
              </div>
            </article>
          )}
          {others.length > 0 && (
            <div data-step className="flex max-w-xl flex-col gap-2">
              <p className="text-sm font-medium text-text">También podría ser:</p>
              <ul className="flex flex-col gap-1.5">
                {others.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => setPending(o.id)}
                      className="flex w-full items-center gap-3 rounded-media bg-surface p-2 text-left shadow-pop transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-out)] hover:bg-surface-2 active:scale-[0.98]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={o.photo} alt="" className="h-12 w-12 shrink-0 rounded-media object-cover" />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-semibold text-text">{o.title}</span>
                        <span className="truncate text-xs text-text-muted">{o.note}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {errorBanner}
          {capped && (
            <p data-step className="max-w-xl text-sm text-text-muted">
              {regenNote}
            </p>
          )}
        </Step>
      );
      break;
    }

    case "design": {
      const forNew = !!pending;
      const photos = !forNew && cur ? cur.photos : [];
      const thumbPhoto = forNew ? (mine?.photo ?? null) : (photo ?? cur?.photoUrl ?? null);
      const different = forNew ? tpl !== null : (tpl !== null && tpl !== cur?.templateId) || (photo !== null && photo !== cur?.photoUrl);
      node = (
        <Step
          thread={thread}
          speech={forNew ? `Elegiste «${clip(mine?.title ?? "tu propiedad")}». ¿Con qué diseño la armamos? Si preferís, elijo yo.` : "Elegí otro diseño y, si querés, otra foto."}
          dock={
            <div className={dockRow}>
              <Button
                disabled={busy !== null || (!forNew && capped) || !different}
                onClick={() =>
                  forNew
                    ? void run({ propertyId: pending!, templateId: tpl ?? undefined })
                    : void run({ templateId: tpl ?? cur!.templateId, photoUrl: photo ?? cur!.photoUrl })
                }
              >
                {forNew ? "Preparar publicación" : "Aplicar cambios"}
              </Button>
              {forNew && (
                <Button variant="secondary" disabled={busy !== null || capped} onClick={() => void run({ propertyId: pending! })}>
                  <Sparkles className="h-4 w-4" aria-hidden />
                  Elegí por mí
                </Button>
              )}
              <Button variant="ghost" onClick={back}>
                Volver
              </Button>
            </div>
          }
        >
          <div data-step className="grid max-w-2xl grid-cols-3 gap-2.5 sm:gap-3" role="group" aria-label="Diseños">
            {TEMPLATE_META.map((t) => (
              <TemplateThumb
                key={t.id}
                meta={t}
                photo={thumbPhoto}
                selected={(tpl ?? (forNew ? -1 : (cur?.templateId ?? -1))) === t.id}
                current={!forNew && cur?.templateId === t.id}
                disabled={busy !== null}
                onSelect={() => setTpl(t.id)}
              />
            ))}
          </div>
          {photos.length > 1 && (
            <div data-step className="flex max-w-2xl flex-col gap-2">
              <p className="text-sm font-medium text-text">Foto</p>
              <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Fotos de la propiedad">
                {photos.map((u) => {
                  const on = (photo ?? cur?.photoUrl) === u;
                  return (
                    <li key={u} className="shrink-0">
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label="Usar esta foto"
                        disabled={busy !== null}
                        onClick={() => setPhoto(u)}
                        className={cn(
                          "block size-16 overflow-hidden rounded-media bg-surface-2 transition-[transform,box-shadow] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.95]",
                          on ? "ring-2 ring-accent ring-offset-2 ring-offset-bg" : "opacity-80 hover:opacity-100"
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" className="h-full w-full object-cover" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {cur && !forNew && (
            <p data-step className="max-w-xl text-xs text-text-muted">
              {capped ? regenNote : `Cambiar el diseño o la foto cuenta como una regeneración. ${regenNote}`}
            </p>
          )}
          {errorBanner}
        </Step>
      );
      break;
    }

    case "working":
      node = (
        <Step thread={thread} speech="Preparando tu publicación…" keepTalking>
          <div data-step>
            <GeneratingCard />
          </div>
        </Step>
      );
      break;

    case "ready":
      node = (
        <Step
          thread={thread}
          speech={
            madeNow
              ? `Listo: «${clip(cur!.title)}». Descargá la imagen y copiá el texto y los hashtags cuando quieras.`
              : state!.mode === "auto"
                ? `Hoy te preparé «${clip(cur!.title)}». Descargá la imagen y copiá el texto y los hashtags cuando quieras.`
                : `Esta es la publicación de hoy: «${clip(cur!.title)}».`
          }
          dock={
            <div className={dockRow}>
              {img.status === "ready" && img.url ? (
                <a className={buttonClasses("primary", "md")} href={img.url} download={fileName}>
                  <Download className="h-4 w-4" aria-hidden />
                  Descargar
                </a>
              ) : (
                <Button disabled>
                  <Download className="h-4 w-4" aria-hidden />
                  Descargar
                </Button>
              )}
              {canShare && img.status === "ready" && (
                <Button variant="secondary" onClick={() => void share()}>
                  <Share2 className="h-4 w-4" aria-hidden />
                  Compartir
                </Button>
              )}
            </div>
          }
        >
          {img.status === "ready" && img.url ? (
            <div data-step>
              <PostResult url={img.url} alt={`Publicación de ${cur!.title}`} caption={caption} captionState={captionState} />
            </div>
          ) : (
            <div data-step className="flex max-w-md items-start gap-3 rounded-card bg-surface p-4 text-sm text-text-muted shadow-card">
              <ImageOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <p>No pude dibujar esta publicación. Probá regenerarla o elegir otra foto.</p>
            </div>
          )}

          <div data-step className="flex max-w-2xl flex-col gap-2.5">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={busy !== null || capped} onClick={() => void run({})}>
                <RefreshCw className="h-4 w-4" aria-hidden />
                Regenerar
              </Button>
              <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => setChanging("design")}>
                <Palette className="h-4 w-4" aria-hidden />
                Cambiar diseño o foto
              </Button>
              <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => setChanging("property")}>
                Otra propiedad
              </Button>
            </div>
            <p className="text-xs text-text-muted">{regenNote}</p>
          </div>

          {errorBanner}

          <div data-step className="flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
            <span>Modo {state!.mode === "auto" ? "automático" : "manual"}.</span>
            <button
              type="button"
              disabled={busy !== null}
              className="font-semibold text-accent hover:underline disabled:opacity-60"
              onClick={() => (state!.mode === "auto" ? (state!.nextReady ? setConfirmManual(true) : void changeMode("manual")) : void changeMode("auto"))}
            >
              Pasar a {state!.mode === "auto" ? "manual" : "automático"}
            </button>
            {previewNote}
            {onChangeAgency && (
              <button type="button" onClick={onChangeAgency} className="font-semibold text-accent hover:underline">
                Cambiar de inmobiliaria
              </button>
            )}
          </div>
        </Step>
      );
      break;
  }

  return (
    <>
      {node}
      <PropertyPicker
        open={pickerOpen}
        layer="overlay"
        onClose={() => setPickerOpen(false)}
        properties={(state as SocialState | null)?.properties ?? []}
        disabled={busy !== null}
        onPick={(id) => {
          setPickerOpen(false);
          setPending(id);
        }}
      />
      <ConfirmDialog
        open={confirmManual}
        layer="overlay"
        title="¿Pasar a modo manual?"
        confirmLabel="Pasar a manual"
        busy={busy === "mode"}
        error={error}
        onCancel={() => setConfirmManual(false)}
        onConfirm={async () => {
          if (await changeMode("manual")) setConfirmManual(false);
        }}
      >
        Vamos a eliminar la publicación que ya estaba preparada para mañana. Desde mañana vas a elegir vos qué propiedad promocionar.
      </ConfirmDialog>
    </>
  );
}
