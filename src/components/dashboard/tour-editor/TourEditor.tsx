"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Crosshair, Flag, MapPin, Move, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { cn } from "@/lib/utils/cn";
import { useTourViewer, type SpherePosition } from "@/components/tour/useTourViewer";
import {
  MAX_LINKS_PER_SCENE,
  MAX_SCENES,
  newId,
  removeScene,
  reverseLink,
  sceneName,
  type TourLink,
  type TourScene,
  type VirtualTourConfig,
} from "@/components/tour/tour-types";
import { uploadPhoto360File } from "@/lib/media/upload-photo360";
import { ArrivalAligner } from "./ArrivalAligner";
import { TargetPicker } from "./TargetPicker";

type Mode = "view" | "add" | "relocate";
type Draft = SpherePosition & { label: string };
/** Qué se está configurando cuando se abren el selector de destino / el alineador. */
type Flow =
  | { kind: "picking"; purpose: "new" | "edit" }
  | { kind: "aligning"; purpose: "new" | "edit"; targetId: string; initial?: SpherePosition };

/**
 * Editor del recorrido 360°: overlay a pantalla completa. Se hace click en
 * la esfera para crear un marcador, se le pone título, se elige (o sube) la
 * foto a la que lleva y se alinea la cámara de llegada. Los cambios se
 * aplican en vivo sobre el estado del formulario de la propiedad; se
 * guardan con el resto de la propiedad.
 */
export function TourEditor({
  scenes,
  virtualTour,
  agencyId,
  initialSceneId,
  onChange,
  onClose,
}: {
  scenes: TourScene[];
  virtualTour: VirtualTourConfig;
  /** Sólo el admin necesita indicarla al subir. */
  agencyId?: string;
  initialSceneId?: string;
  onChange: (scenes: TourScene[], virtualTour: VirtualTourConfig) => void;
  onClose: () => void;
}) {
  const [sceneId, setSceneId] = useState(initialSceneId ?? scenes[0]?.id ?? "");
  const [entry, setEntry] = useState<SpherePosition | undefined>(undefined);
  const [mode, setMode] = useState<Mode>("view");
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [confirmDeleteScene, setConfirmDeleteScene] = useState(false);

  const scene = scenes.find((s) => s.id === sceneId);
  const sceneIndex = scenes.findIndex((s) => s.id === sceneId);
  const selectedLink = scene?.links.find((l) => l.id === selectedLinkId) ?? null;
  const linksFull = (scene?.links.length ?? 0) >= MAX_LINKS_PER_SCENE;

  function patchScene(id: string, fn: (s: TourScene) => TourScene) {
    onChange(
      scenes.map((s) => (s.id === id ? fn(s) : s)),
      virtualTour
    );
  }

  function patchLink(linkId: string, patch: Partial<TourLink>) {
    patchScene(sceneId, (s) => ({ ...s, links: s.links.map((l) => (l.id === linkId ? { ...l, ...patch } : l)) }));
  }

  const { containerRef, shownSceneId, loadError } = useTourViewer({
    scenes,
    sceneId,
    entry,
    selectedLinkId,
    ghost: draft,
    onLinkSelect: (link) => {
      setMode("view");
      setDraft(null);
      setSelectedLinkId(link.id);
      setPanelOpen(true);
    },
    onSphereClick: (pos) => {
      if (mode === "add" && !linksFull) {
        setDraft({ ...pos, label: "" });
        setPanelOpen(true);
      } else if (mode === "relocate" && selectedLinkId) {
        patchLink(selectedLinkId, { yaw: pos.yaw, pitch: pos.pitch });
        setMode("view");
        setNotice("Marcador movido.");
      } else {
        setSelectedLinkId(null);
      }
    },
  });

  // Escape cierra el paso abierto más interno, o el editor.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (flow) setFlow(null);
      else if (draft) setDraft(null);
      else if (mode !== "view") setMode("view");
      else onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flow, draft, mode, onClose]);

  // Bloquea el scroll de la página de atrás mientras el editor está abierto.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  function selectScene(id: string) {
    setSceneId(id);
    setEntry(undefined);
    setMode("view");
    setDraft(null);
    setSelectedLinkId(null);
    setConfirmDeleteScene(false);
  }

  /** Sube una foto nueva y la suma como escena. Devuelve su id. */
  async function uploadScene(file: File): Promise<string> {
    if (scenes.length >= MAX_SCENES) throw new Error(`Máximo ${MAX_SCENES} fotos 360° por propiedad.`);
    const url = await uploadPhoto360File(file, agencyId);
    const id = newId();
    onChange([...scenes, { id, label: "", photo360Url: url, links: [] }], virtualTour);
    return id;
  }

  /** Aplica el resultado del alineador: crea/edita el marcador y el vínculo de vuelta. */
  function applyArrival(targetId: string, purpose: "new" | "edit", arrival: SpherePosition) {
    if (!scene) return;
    const targetIdx = scenes.findIndex((s) => s.id === targetId);
    const target = scenes[targetIdx];
    if (!target) return;

    let link: TourLink;
    let nextLinks: TourLink[];
    if (purpose === "new" && draft) {
      link = {
        id: newId(),
        targetId,
        label: (draft.label.trim() || sceneName(target, targetIdx)).slice(0, 40),
        yaw: draft.yaw,
        pitch: draft.pitch,
        arrivalYaw: arrival.yaw,
        arrivalPitch: arrival.pitch,
      };
      nextLinks = [...scene.links, link];
    } else if (purpose === "edit" && selectedLink) {
      link = { ...selectedLink, targetId, arrivalYaw: arrival.yaw, arrivalPitch: arrival.pitch };
      nextLinks = scene.links.map((l) => (l.id === link.id ? link : l));
    } else {
      return;
    }

    // Vínculo de vuelta automático, si la foto destino todavía no apunta acá.
    const needsBack = !target.links.some((l) => l.targetId === scene.id) && target.links.length < MAX_LINKS_PER_SCENE;
    const back = needsBack ? reverseLink(link, sceneName(scene, sceneIndex), scene.id) : null;

    onChange(
      scenes.map((s) => {
        if (s.id === scene.id) return { ...s, links: nextLinks };
        if (s.id === targetId && back) return { ...s, links: [...s.links, back] };
        return s;
      }),
      virtualTour
    );

    setDraft(null);
    setMode("view");
    setSelectedLinkId(link.id);
    setFlow(null);
    if (back) {
      setNotice(`Se creó "${back.label}" en "${sceneName(target, targetIdx)}" para volver. Podés moverlo o borrarlo.`);
    }
  }

  function deleteLink(linkId: string) {
    patchScene(sceneId, (s) => ({ ...s, links: s.links.filter((l) => l.id !== linkId) }));
    setSelectedLinkId(null);
  }

  function deleteScene() {
    const next = removeScene(scenes, sceneId);
    const startId = virtualTour.startId === sceneId ? undefined : virtualTour.startId;
    onChange(next, { ...virtualTour, startId });
    setConfirmDeleteScene(false);
    if (next[0]) selectScene(next[0].id);
  }

  const startId = virtualTour.startId ?? scenes[0]?.id;
  const thumbs = useMemo(() => scenes, [scenes]);

  if (!scene) {
    return (
      <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-center justify-center bg-bg p-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-text-muted">Subí al menos 2 fotos 360° para armar un recorrido.</p>
          <Button type="button" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    );
  }

  // Portal: el editor se monta desde dentro del <form> de la propiedad — fuera del
  // form, Enter en un input no envía la propiedad por accidente.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Editor del recorrido 360°" className="fixed inset-0 z-[60] flex flex-col bg-bg">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <h2 className="font-display text-base font-semibold text-text">Recorrido 360°</h2>
        <Button type="button" size="sm" onClick={onClose}>
          Listo
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Esfera */}
        <div className="relative min-h-0 flex-1 bg-surface-2">
          <div ref={containerRef} className="absolute inset-0" />

          {shownSceneId === null && !loadError && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface-2/60 text-sm text-text-muted">
              Cargando foto 360°…
            </div>
          )}
          {loadError && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface-2 text-sm text-text-muted">
              No se pudo cargar esta foto 360°.
            </div>
          )}

          <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2">
            <span className="rounded-pill bg-surface/85 px-3.5 py-2.5 text-xs font-semibold text-text shadow-pop backdrop-blur">
              {sceneName(scene, sceneIndex)}
            </span>
            <button
              type="button"
              disabled={linksFull}
              onClick={() => {
                setSelectedLinkId(null);
                setDraft(null);
                setMode((m) => (m === "add" ? "view" : "add"));
              }}
              aria-pressed={mode === "add"}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-pill px-4 text-xs font-medium shadow-pop backdrop-blur",
                "transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.97]",
                "disabled:pointer-events-none disabled:opacity-50",
                mode === "add" ? "bg-accent text-accent-contrast" : "bg-surface/85 text-text hover:bg-surface"
              )}
            >
              {mode === "add" ? <X className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
              {mode === "add" ? "Cancelar" : "Agregar marcador"}
            </button>
          </div>

          {(mode === "add" || mode === "relocate") && !draft && (
            <div
              role="status"
              className="pointer-events-none absolute inset-x-0 bottom-3 z-10 mx-auto flex w-fit max-w-[90%] items-center gap-1.5 rounded-pill bg-surface/90 px-3.5 py-2 text-xs font-medium text-text shadow-pop backdrop-blur"
            >
              <Crosshair className="h-3.5 w-3.5 text-accent" aria-hidden />
              {mode === "add" ? "Tocá en la foto donde va el marcador" : "Tocá la nueva posición del marcador"}
            </div>
          )}
        </div>

        {/* Panel: lateral en desktop, hoja inferior en mobile */}
        <aside
          className={cn(
            "flex shrink-0 flex-col border-t border-border bg-bg lg:w-[22rem] lg:border-l lg:border-t-0",
            "transition-[max-height] duration-200 [transition-timing-function:var(--ease-out)]",
            panelOpen ? "max-h-[46dvh] lg:max-h-none" : "max-h-12 lg:max-h-none"
          )}
        >
          <button
            type="button"
            onClick={() => setPanelOpen((o) => !o)}
            aria-expanded={panelOpen}
            className="flex h-12 shrink-0 items-center justify-between px-4 text-sm font-medium text-text lg:hidden"
          >
            Marcadores y fotos
            <ChevronDown className={cn("h-4 w-4 transition-transform", panelOpen && "rotate-180")} aria-hidden />
          </button>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4 lg:pt-4">
            {notice && (
              <p role="status" className="rounded-media bg-accent-soft px-3 py-2 text-xs text-text">
                {notice}
              </p>
            )}

            {/* Marcador nuevo */}
            {draft && (
              <section className="flex flex-col gap-3 rounded-media border border-accent p-3">
                <h3 className="text-sm font-semibold text-text">Nuevo marcador</h3>
                <FormField
                  label="Título"
                  placeholder="Ej: Entrada, Comedor…"
                  maxLength={40}
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                />
                <div className="flex gap-2">
                  <Button type="button" className="flex-1" onClick={() => setFlow({ kind: "picking", purpose: "new" })}>
                    Elegir destino
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setDraft(null)}>
                    Descartar
                  </Button>
                </div>
              </section>
            )}

            {/* Marcador seleccionado */}
            {selectedLink && !draft && (
              <section className="flex flex-col gap-3 rounded-media border border-border p-3">
                <h3 className="text-sm font-semibold text-text">Marcador seleccionado</h3>
                <FormField
                  label="Título"
                  maxLength={40}
                  value={selectedLink.label}
                  onChange={(e) => patchLink(selectedLink.id, { label: e.target.value })}
                />
                <p className="text-xs text-text-muted">
                  Lleva a:{" "}
                  <strong className="text-text">
                    {sceneName(
                      scenes.find((s) => s.id === selectedLink.targetId) ?? scene,
                      scenes.findIndex((s) => s.id === selectedLink.targetId)
                    )}
                  </strong>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setFlow({
                        kind: "aligning",
                        purpose: "edit",
                        targetId: selectedLink.targetId,
                        initial: { yaw: selectedLink.arrivalYaw, pitch: selectedLink.arrivalPitch },
                      })
                    }
                  >
                    <Crosshair className="h-3.5 w-3.5" aria-hidden /> Vista de llegada
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setFlow({ kind: "picking", purpose: "edit" })}>
                    Cambiar destino
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setMode("relocate")}>
                    <Move className="h-3.5 w-3.5" aria-hidden /> Mover
                  </Button>
                  <Button type="button" size="sm" variant="danger" onClick={() => deleteLink(selectedLink.id)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> Eliminar
                  </Button>
                </div>
              </section>
            )}

            {/* Marcadores de esta foto */}
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-text">
                Marcadores de esta foto ({scene.links.length}/{MAX_LINKS_PER_SCENE})
              </h3>
              {scene.links.length === 0 ? (
                <p className="text-xs text-text-muted">
                  Todavía no hay marcadores. Tocá &quot;Agregar marcador&quot; y después el punto de la foto donde va (una puerta, un pasillo…).
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {scene.links.map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(null);
                          setMode("view");
                          setSelectedLinkId(l.id);
                        }}
                        className={cn(
                          "flex min-h-11 w-full items-center gap-2 rounded-media border px-3 text-left text-sm transition-colors",
                          l.id === selectedLinkId ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2"
                        )}
                      >
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                        <span className="truncate">{l.label || "Sin título"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Esta foto */}
            <section className="flex flex-col gap-2 border-t border-border pt-4">
              <FormField
                label="Nombre de esta foto"
                maxLength={60}
                placeholder="Ej: Patio"
                value={scene.label ?? ""}
                onChange={(e) => patchScene(sceneId, (s) => ({ ...s, label: e.target.value }))}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={startId === scene.id ? "primary" : "secondary"}
                  onClick={() => onChange(scenes, { ...virtualTour, startId: scene.id })}
                >
                  <Flag className="h-3.5 w-3.5" aria-hidden /> {startId === scene.id ? "Foto de inicio" : "Usar como inicio"}
                </Button>
                {confirmDeleteScene ? (
                  <>
                    <Button type="button" size="sm" variant="danger" onClick={deleteScene}>
                      Sí, quitar foto
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => setConfirmDeleteScene(false)}>
                      No
                    </Button>
                  </>
                ) : (
                  <Button type="button" size="sm" variant="secondary" onClick={() => setConfirmDeleteScene(true)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> Quitar foto
                  </Button>
                )}
              </div>
              {confirmDeleteScene && (
                <p className="text-xs text-text-muted">También se borran los marcadores de otras fotos que llevaban a esta.</p>
              )}
            </section>

            {/* Fotos del recorrido */}
            <section className="flex flex-col gap-2 border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-text">Fotos ({scenes.length}/{MAX_SCENES})</h3>
              <ul className="grid grid-cols-3 gap-2 lg:grid-cols-2">
                {thumbs.map((s, i) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => selectScene(s.id)}
                      aria-current={s.id === sceneId}
                      className="flex w-full flex-col gap-1 text-left transition-transform duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.97]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={s.photo360Url}
                        alt=""
                        loading="lazy"
                        className={cn(
                          "aspect-[16/10] w-full rounded-media bg-surface-2 object-cover",
                          s.id === sceneId && "ring-2 ring-accent ring-offset-2 ring-offset-bg"
                        )}
                      />
                      <span className="truncate text-xs font-medium text-text">
                        {sceneName(s, i)}
                        {s.id === startId && " ·  inicio"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </aside>
      </div>

      {flow?.kind === "picking" && (
        <TargetPicker
          scenes={scenes}
          excludeId={scene.id}
          canUpload={scenes.length < MAX_SCENES}
          onClose={() => setFlow(null)}
          onUpload={uploadScene}
          onPick={(targetId) => {
            const existing =
              flow.purpose === "edit" && selectedLink && selectedLink.targetId === targetId
                ? { yaw: selectedLink.arrivalYaw, pitch: selectedLink.arrivalPitch }
                : undefined;
            setFlow({ kind: "aligning", purpose: flow.purpose, targetId, initial: existing });
          }}
        />
      )}

      {flow?.kind === "aligning" && scenes.find((s) => s.id === flow.targetId) && (
        <ArrivalAligner
          // `key`: el alineador crea su propio viewer — uno nuevo por destino.
          key={flow.targetId}
          target={scenes.find((s) => s.id === flow.targetId)!}
          fromLabel={sceneName(scene, sceneIndex)}
          initial={flow.initial}
          onCancel={() => setFlow(null)}
          onConfirm={(pos) => applyArrival(flow.targetId, flow.purpose, pos)}
        />
      )}

    </div>,
    document.body
  );
}
