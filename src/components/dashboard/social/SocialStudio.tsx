"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Check, Download, ImageOff, MousePointerClick, RefreshCw } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MODES, ModeCard } from "@/components/social/ModeCard";
import { CaptionCard } from "@/components/social/CaptionCard";
import { PropertyPicker } from "@/components/social/PropertyPicker";
import { useSocialCaption } from "@/components/social/useSocialCaption";
import { useSocialStudio } from "@/components/social/useSocialStudio";
import { cn } from "@/lib/utils/cn";
import type { SocialMode, SocialState } from "@/lib/social/types";

export function SocialStudio({ agencyId, initial }: { agencyId: string | null; initial: SocialState }) {
  const { state: current, busy, error, qs, agencyParam, changeMode, generate } = useSocialStudio(agencyId, initial);
  const state = current ?? initial;
  const { caption, state: captionState } = useSocialCaption(state.current ? `${state.current.propertyId}:${state.current.version}` : null, qs);
  const [choice, setChoice] = useState<SocialMode>("auto");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmManual, setConfirmManual] = useState(false);
  const root = useRef<HTMLDivElement>(null);

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
              src={state.current ? `/api/dashboard/social/image?slot=current&v=${state.current.version}${agencyParam}` : null}
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
                <p className="text-sm text-text-muted">{state.current ? state.current.title : "Todavía no hay una publicación para hoy."}</p>
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
                    <Button variant="secondary" disabled={busy !== null || state.regenLeft === 0} onClick={() => generate()}>
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

            {state.current && (
              <div data-reveal>
                <CaptionCard caption={caption} state={captionState} />
              </div>
            )}

            {state.mode === "auto" && (
              <section data-reveal className="flex items-center gap-3 rounded-card bg-surface p-5 shadow-card">
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", state.nextReady ? "bg-accent/10 text-accent" : "bg-surface-2 text-text-muted")}>
                  <Check className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <h2 className="font-display text-base font-bold text-text">Próxima publicación</h2>
                  <p className="text-sm text-text-muted">{state.nextReady ? "Preparada ✓ Mañana la vas a encontrar acá." : "Se prepara en cuanto haya propiedades."}</p>
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

      <PropertyPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        properties={state.properties}
        disabled={busy !== null}
        onPick={async (id) => {
          setPickerOpen(false);
          await generate({ propertyId: id });
        }}
      />

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
        Vamos a eliminar la publicación que ya estaba preparada para mañana. Desde mañana vas a elegir vos qué propiedad promocionar.
      </ConfirmDialog>
    </div>
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
      {src && shown !== src && failed !== src && !shown && <div className="absolute inset-0 animate-pulse bg-surface-2" aria-hidden />}
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
      <p className="text-sm text-text-muted">Necesitás al menos una propiedad publicada con fotos. Las fotos 360° no se usan para estas publicaciones.</p>
      <Link href="/dashboard/propiedades/nueva" className={buttonClasses("primary", "md")}>
        Cargar una propiedad
      </Link>
    </div>
  );
}
