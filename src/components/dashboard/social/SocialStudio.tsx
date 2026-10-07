"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Check, Download, ImageOff, MousePointerClick, RefreshCw, Wand2, type LucideIcon } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/utils/cn";
import type { SocialState } from "@/lib/social/engine";

type Mode = "auto" | "manual";

/** Qué hace cada modo (mismo texto en la primera vez y en el selector permanente). */
const MODES: { id: Mode; title: string; hint: string; badge?: string; icon: LucideIcon }[] = [
  {
    id: "auto",
    title: "Automático",
    badge: "Recomendado",
    hint: "La plataforma seleccionará propiedades, fotografías y diseños automáticamente y preparará contenido para vos.",
    icon: Wand2,
  },
  {
    id: "manual",
    title: "Manual",
    hint: "Vos elegís qué propiedad querés promocionar cada día.",
    icon: MousePointerClick,
  },
];

export function SocialStudio({ agencyId, initial }: { agencyId: string | null; initial: SocialState }) {
  const [state, setState] = useState(initial);
  const [choice, setChoice] = useState<Mode>("auto");
  const [busy, setBusy] = useState<null | "mode" | "generate">(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmManual, setConfirmManual] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const qs = agencyId ? `?agencyId=${agencyId}` : "";
  const agencyParam = agencyId ? `&agencyId=${agencyId}` : "";

  const call = useCallback(
    async (path: string, init: RequestInit, kind: "mode" | "generate"): Promise<boolean> => {
      setBusy(kind);
      setError(null);
      try {
        const res = await fetch(`/api/dashboard/social${path}${qs}`, {
          ...init,
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Algo salió mal. Probá de nuevo.");
          return false;
        }
        setState(data as SocialState);
        return true;
      } catch {
        setError("No pudimos conectarnos. Revisá tu conexión.");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [qs]
  );

  const changeMode = useCallback(
    (mode: Mode) => call("", { method: "PATCH", body: JSON.stringify({ mode }) }, "mode"),
    [call]
  );
  const generate = useCallback(
    (propertyId?: string) => call("/generate", { method: "POST", body: JSON.stringify({ propertyId }) }, "generate"),
    [call]
  );

  // Entrada escalonada al abrir y al pasar de la elección inicial a la pantalla principal.
  const screen = state.mode === null ? "onboarding" : "main";
  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from("[data-reveal]", {
        opacity: 0,
        y: 8,
        duration: 0.32,
        ease: "power3.out",
        stagger: 0.05,
        clearProps: "transform,opacity",
      });
    },
    { scope: root, dependencies: [screen] }
  );

  if (state.properties.length === 0 && state.mode === null) {
    return <EmptyState />;
  }

  return (
    <div ref={root}>
      {state.mode === null ? (
        <section className="mx-auto flex max-w-2xl flex-col gap-5" aria-labelledby="social-first">
          <div data-reveal>
            <h2 id="social-first" className="font-display text-xl font-bold text-text">
              ¿Cómo querés preparar tus publicaciones?
            </h2>
            <p className="mt-1 text-sm text-text-muted">Podés cambiarlo cuando quieras desde esta misma sección.</p>
          </div>
          <div role="radiogroup" aria-labelledby="social-first" className="grid gap-3 sm:grid-cols-2">
            {MODES.map((m) => (
              <ModeCard key={m.id} mode={m} animated selected={choice === m.id} onSelect={() => setChoice(m.id)} />
            ))}
          </div>
          <div data-reveal className="flex flex-col items-start gap-2">
            <Button size="lg" disabled={busy !== null} onClick={() => changeMode(choice)}>
              {busy === "mode" ? "Preparando…" : "Continuar"}
            </Button>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </div>
        </section>
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
          <div data-reveal>
            <Preview
              src={
                state.current
                  ? `/api/dashboard/social/image?slot=current&v=${state.current.version}${agencyParam}`
                  : null
              }
              busy={busy === "generate"}
              manual={state.mode === "manual"}
              hasProperties={state.properties.length > 0}
              onPick={() => setPickerOpen(true)}
            />
          </div>

          <div className="flex flex-col gap-6">
            <section data-reveal className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
              <div>
                <h2 className="font-display text-lg font-bold text-text">Publicación de hoy</h2>
                <p className="text-sm text-text-muted">
                  {state.current ? state.current.title : "Todavía no hay una publicación para hoy."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {state.mode === "manual" && (
                  <Button variant={state.current ? "secondary" : "primary"} onClick={() => setPickerOpen(true)}>
                    <MousePointerClick className="h-4 w-4" aria-hidden />
                    Elegir propiedad
                  </Button>
                )}
                {state.current && (
                  <>
                    <Button
                      variant="secondary"
                      disabled={busy !== null || state.regenLeft === 0}
                      onClick={() => generate()}
                    >
                      <RefreshCw className={cn("h-4 w-4", busy === "generate" && "animate-spin")} aria-hidden />
                      Regenerar
                    </Button>
                    <a
                      className={buttonClasses("primary", "md")}
                      href={`/api/dashboard/social/image?slot=current&download=1&v=${state.current.version}${agencyParam}`}
                      download
                    >
                      <Download className="h-4 w-4" aria-hidden />
                      Descargar
                    </a>
                  </>
                )}
              </div>
              {state.current && (
                <p className="text-xs text-text-muted">
                  {state.regenLeft === null
                    ? "Regeneraciones ilimitadas (administrador)."
                    : state.regenLeft === 0
                      ? "Ya usaste las 3 regeneraciones de hoy. Mañana vuelven a estar disponibles."
                      : state.regenLeft === 1
                        ? "Te queda 1 regeneración hoy."
                        : `Te quedan ${state.regenLeft} regeneraciones hoy.`}
                </p>
              )}
              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}
            </section>

            {state.mode === "auto" && (
              <section data-reveal className="flex items-center gap-3 rounded-card bg-surface p-5 shadow-card">
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    state.nextReady ? "bg-accent/10 text-accent" : "bg-surface-2 text-text-muted"
                  )}
                >
                  <Check className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <h2 className="font-display text-base font-bold text-text">Próxima publicación</h2>
                  <p className="text-sm text-text-muted">
                    {state.nextReady ? "Preparada ✓ Mañana la vas a encontrar acá." : "Se prepara en cuanto haya propiedades."}
                  </p>
                </div>
              </section>
            )}

            <section data-reveal className="flex flex-col gap-3 rounded-card bg-surface p-5 shadow-card">
              <h2 className="font-display text-base font-bold text-text">Modo de preparación</h2>
              <div role="radiogroup" aria-label="Modo de preparación" className="grid gap-2 sm:grid-cols-2">
                {MODES.map((m) => (
                  <ModeCard
                    key={m.id}
                    mode={m}
                    compact
                    selected={state.mode === m.id}
                    disabled={busy !== null}
                    onSelect={() => {
                      if (state.mode === m.id) return;
                      if (m.id === "manual" && state.nextReady) setConfirmManual(true);
                      else changeMode(m.id);
                    }}
                  />
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Elegir propiedad">
        <ul className="grid gap-2 sm:grid-cols-2">
          {state.properties.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={busy !== null}
                onClick={async () => {
                  setPickerOpen(false);
                  await generate(p.id);
                }}
                className="flex w-full items-center gap-3 rounded-media p-2 text-left transition-[background-color,transform] duration-150 [transition-timing-function:var(--ease-out)] hover:bg-surface-2 active:scale-[0.98]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.photo} alt="" className="h-14 w-14 shrink-0 rounded-media object-cover" />
                <span className="line-clamp-2 text-sm font-medium text-text">{p.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <ConfirmDialog
        open={confirmManual}
        title="¿Pasar a modo manual?"
        confirmLabel="Pasar a manual"
        busy={busy === "mode"}
        error={error}
        onCancel={() => setConfirmManual(false)}
        onConfirm={async () => {
          if (await changeMode("manual")) setConfirmManual(false);
        }}
      >
        Vamos a eliminar la publicación que ya estaba preparada para mañana. Desde mañana vas a elegir vos qué
        propiedad promocionar.
      </ConfirmDialog>
    </div>
  );
}

function ModeCard({
  mode,
  selected,
  onSelect,
  compact = false,
  animated = false,
  disabled = false,
}: {
  mode: (typeof MODES)[number];
  selected: boolean;
  onSelect: () => void;
  compact?: boolean;
  animated?: boolean;
  disabled?: boolean;
}) {
  const Icon = mode.icon;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      data-reveal={animated ? "" : undefined}
      className={cn(
        "flex flex-col gap-2 rounded-card p-4 text-left transition-[transform,box-shadow,background-color] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        compact ? "bg-surface-2" : "bg-surface shadow-card hover:shadow-float",
        selected && "ring-2 ring-accent",
        disabled && "pointer-events-none opacity-60"
      )}
    >
      <span className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", selected ? "text-accent" : "text-text-muted")} aria-hidden />
        <span className="font-display text-base font-bold text-text">{mode.title}</span>
        {mode.badge && !compact && (
          <span className="rounded-pill bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">{mode.badge}</span>
        )}
      </span>
      <span className="text-sm text-text-muted">{mode.hint}</span>
    </button>
  );
}

/** Vista previa 4:5 con fundido cruzado: la imagen nueva entra por encima de la anterior. */
function Preview({
  src,
  busy,
  manual,
  hasProperties,
  onPick,
}: {
  src: string | null;
  busy: boolean;
  manual: boolean;
  hasProperties: boolean;
  onPick: () => void;
}) {
  const [shown, setShown] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  // Sin imagen (modo manual sin elegir): se olvida la anterior.
  useEffect(() => {
    if (src) return;
    const raf = requestAnimationFrame(() => setShown(null));
    return () => cancelAnimationFrame(raf);
  }, [src]);

  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-card bg-surface-2 shadow-card">
      {src && shown && shown !== src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shown} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {src && failed !== src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt="Vista previa de la publicación de hoy"
          onLoad={() => setShown(src)}
          onError={() => setFailed(src)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-300 [transition-timing-function:var(--ease-out)]",
            shown === src ? "opacity-100" : "opacity-0"
          )}
        />
      )}
      {src && shown !== src && failed !== src && !shown && (
        <div className="absolute inset-0 animate-pulse bg-surface-2" aria-hidden />
      )}
      {(!src || failed === src) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <ImageOff className="h-8 w-8 text-text-muted" aria-hidden />
          <p className="text-sm text-text-muted">
            {failed === src
              ? "No pudimos dibujar esta publicación. Probá regenerarla."
              : manual
                ? "Elegí qué propiedad querés promocionar hoy."
                : "Todavía no hay una publicación para hoy."}
          </p>
          {manual && hasProperties && !failed && (
            <Button size="sm" onClick={onPick}>
              Elegir propiedad
            </Button>
          )}
        </div>
      )}
      {busy && <div className="absolute inset-0 bg-bg/40" aria-hidden />}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-card bg-surface p-8 text-center shadow-card">
      <ImageOff className="h-8 w-8 text-text-muted" aria-hidden />
      <h2 className="font-display text-lg font-bold text-text">Todavía no hay con qué armar publicaciones</h2>
      <p className="text-sm text-text-muted">
        Necesitás al menos una propiedad publicada con fotos. Las fotos 360° no se usan para estas publicaciones.
      </p>
      <Link href="/dashboard/propiedades/nueva" className={buttonClasses("primary", "md")}>
        Cargar una propiedad
      </Link>
    </div>
  );
}
