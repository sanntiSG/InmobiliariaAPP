"use client";

import { useState, type DragEvent } from "react";
import {
  FileArchive,
  FolderUp,
  Image as ImageIcon,
  Info,
  LoaderCircle,
  MessageCircle,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { AmbientManifest } from "@/vendor/ambient";
import { Button, buttonClasses } from "@/components/ui/Button";
import { InfoDialog } from "@/components/ui/InfoDialog";
import { SelectField } from "@/components/ui/SelectField";
import { AmbientCoverLazy } from "@/components/property/AmbientCoverLazy";
import { AmbientStateIcon } from "@/components/property/ambient-icons";
import { AMBIENT_START_AUTO } from "@/lib/ambient/constants";
import { entriesFromDrop, entriesFromFiles } from "@/lib/ambient/folder-input";
import { referencedFiles, type FolderEntry } from "@/lib/ambient/validate";
import { deleteAmbientCover, uploadAmbientFolder, type AmbientUploadProgress } from "@/lib/media/upload-ambient";
import { providerAmbientMessage, whatsappUrl } from "@/lib/whatsapp/messages";
import { cn } from "@/lib/utils/cn";

/** Qué imagen es la portada de la propiedad: la primera foto o la portada viva. */
export type CoverMode = "photo" | "ambient";

/** La portada viva en el formulario: la ya verificada por el servidor + lo que la inmobiliaria decidió mostrar. */
export type AmbientFormState = {
  cover: {
    coverId: string;
    baseUrl: string;
    manifest: AmbientManifest;
    poster: { url: string; width?: number; height?: number };
  };
  /** Ids de los estados activos (al menos uno). */
  states: string[];
  /** `"auto"` = según la hora de quien mira, o el id de un estado. */
  start: string;
  /** Subida en esta sesión y todavía sin guardar: si se quita, se borra del storage al instante. */
  fresh: boolean;
};

/** Lo que viaja al servidor: sólo cuál, qué estados y con cuál arranca (lo demás sale de la portada ya verificada). */
export function toAmbientPayload(mode: CoverMode, ambient: AmbientFormState | null) {
  if (mode !== "ambient" || !ambient) return null;
  return { coverId: ambient.cover.coverId, states: ambient.states, start: ambient.start };
}

const formatBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB` : `${Math.round(n / 1024)} KB`);

const PROGRESS_LABEL = {
  checking: "Revisando la carpeta…",
  verifying: "Verificando que todo esté bien…",
} as const;

export function AmbientCoverField({
  mode,
  onModeChange,
  ambient,
  onAmbientChange,
  agencyId,
  title,
}: {
  mode: CoverMode;
  onModeChange: (mode: CoverMode) => void;
  ambient: AmbientFormState | null;
  onAmbientChange: (next: AmbientFormState | null) => void;
  /** Sólo el admin: la inmobiliaria a la que se sube la portada. */
  agencyId?: string;
  /** Título de la propiedad (lo lee el lector de pantalla en la vista previa). */
  title: string;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [progress, setProgress] = useState<AmbientUploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [dragging, setDragging] = useState(false);

  function chooseMode(next: CoverMode) {
    onModeChange(next);
    // La primera vez que se elige (sin carpeta cargada) se explica qué es y qué hace falta.
    if (next === "ambient" && !ambient) setInfoOpen(true);
  }

  async function run(getEntries: () => Promise<FolderEntry[]>) {
    setError(null);
    setProgress({ phase: "checking", done: 0, total: 1 });
    try {
      const entries = await getEntries();
      const cover = await uploadAmbientFolder(entries, { agencyId, onProgress: setProgress });
      // Si ya había una portada subida en esta sesión y sin guardar, la reemplazada se borra.
      if (ambient?.fresh) void deleteAmbientCover(ambient.cover.coverId);
      onAmbientChange({
        cover: { coverId: cover.coverId, baseUrl: cover.baseUrl, manifest: cover.manifest, poster: cover.poster },
        states: cover.manifest.states.map((s) => s.id),
        start: AMBIENT_START_AUTO,
        fresh: true,
      });
      setReplacing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la portada.");
    } finally {
      setProgress(null);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (progress) return;
    void run(() => entriesFromDrop(e.dataTransfer));
  }

  function remove() {
    if (ambient?.fresh) void deleteAmbientCover(ambient.cover.coverId);
    onAmbientChange(null);
    setReplacing(false);
    setError(null);
  }

  const showUploader = !ambient || replacing;

  return (
    <section id="portada" className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-text">Portada</h2>
        <Button type="button" variant="ghost" size="sm" onClick={() => setInfoOpen(true)}>
          <Info className="h-4 w-4" aria-hidden /> ¿Qué es la portada viva?
        </Button>
      </div>
      <p className="text-sm text-text-muted">
        Es la imagen principal de la propiedad: lo primero que se ve en el listado, en el mapa y en la ficha.
      </p>

      <div role="radiogroup" aria-label="Tipo de portada" className="grid gap-3 sm:grid-cols-2">
        <ModeOption
          checked={mode === "photo"}
          onChange={() => chooseMode("photo")}
          icon={<ImageIcon className="h-4 w-4" aria-hidden />}
          title="Foto tradicional"
          description="Usa la primera de tus fotos. Podés cambiar el orden en «Fotos»."
        />
        <ModeOption
          checked={mode === "ambient"}
          onChange={() => chooseMode("ambient")}
          icon={<Sparkles className="h-4 w-4" aria-hidden />}
          title="Portada viva"
          description="Una misma foto de día, al atardecer, de noche, con lluvia y con viento."
        />
      </div>

      {mode === "ambient" && (
        <div className="rise flex flex-col gap-3">
          {showUploader ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "flex flex-col items-center gap-1 rounded-media border-2 border-dashed px-5 py-8 text-center",
                "transition-[background-color,border-color] duration-150 [transition-timing-function:var(--ease-out)]",
                dragging ? "border-accent bg-accent-soft" : "border-border"
              )}
            >
              {progress ? (
                <UploadProgress progress={progress} />
              ) : (
                <>
                  <FolderUp className="mb-1 h-6 w-6 text-text-muted" aria-hidden />
                  <p className="font-medium text-text">Arrastrá acá la carpeta que te dio el proveedor</p>
                  <p className="max-w-md text-sm text-text-muted">
                    También sirve el archivo .zip. Antes de subirla revisamos que esté completa y que sea una portada viva.
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <label
                      className={cn(
                        buttonClasses("secondary", "sm", "cursor-pointer [@media(pointer:coarse)]:hidden"),
                        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40"
                      )}
                    >
                      <FolderUp className="h-4 w-4" aria-hidden /> Elegir carpeta
                      <input
                        type="file"
                        className="sr-only"
                        // `webkitdirectory` no está en los tipos de React; los navegadores de escritorio sí lo entienden.
                        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
                        onChange={(e) => {
                          const files = Array.from(e.target.files ?? []);
                          e.target.value = "";
                          if (files.length) void run(() => entriesFromFiles(files));
                        }}
                      />
                    </label>
                    <label
                      className={cn(
                        buttonClasses("secondary", "sm", "cursor-pointer"),
                        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40"
                      )}
                    >
                      <FileArchive className="h-4 w-4" aria-hidden /> Elegir .zip o archivos
                      <input
                        type="file"
                        multiple
                        accept=".zip,.json,.webp,.avif,application/zip,application/json,image/webp,image/avif"
                        className="sr-only"
                        onChange={(e) => {
                          const files = Array.from(e.target.files ?? []);
                          e.target.value = "";
                          if (files.length) void run(() => entriesFromFiles(files));
                        }}
                      />
                    </label>
                    {ambient && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setReplacing(false);
                          setError(null);
                        }}
                      >
                        Cancelar
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <AmbientEditor ambient={ambient} title={title || "la propiedad"} onChange={onAmbientChange} onReplace={() => setReplacing(true)} onRemove={remove} />
          )}

          {error && (
            <div role="alert" className="flex items-start gap-3 rounded-media bg-danger-soft p-3 text-sm text-danger">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div className="flex flex-col gap-1">
                <p>{error}</p>
                <a
                  href={whatsappUrl(providerAmbientMessage())}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-fit font-medium underline underline-offset-2"
                >
                  ¿Necesitás ayuda? Escribile al proveedor
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      <InfoDialog
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="Portada viva"
        icon={<Sparkles className="h-5 w-5" aria-hidden />}
        actions={
          <>
            <Button type="button" onClick={() => setInfoOpen(false)}>
              Tengo la carpeta
            </Button>
            <a
              href={whatsappUrl(providerAmbientMessage())}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses("secondary", "md", "w-full")}
            >
              <MessageCircle className="h-4 w-4" aria-hidden /> No la tengo: pedirla por WhatsApp
            </a>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                onModeChange("photo");
                setInfoOpen(false);
              }}
            >
              Usar foto tradicional
            </Button>
          </>
        }
      >
        <p>
          Con una sola foto de la propiedad, quien la mira elige cómo verla: de día, al atardecer, de noche, con lluvia o con
          viento.
        </p>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 marker:text-accent">
          <li>La escena cambia con una transición suave entre un momento y otro.</li>
          <li>Se mueven las plantas con el viento, cae la lluvia, brilla el suelo mojado y se encienden las luces.</li>
          <li>Pesa poco y se adapta al celular, la tablet y la computadora.</li>
        </ul>
        <p>
          Es un <strong className="font-semibold text-text">servicio aparte</strong>: el proveedor prepara una carpeta con tu
          foto. La arrastrás acá y el sistema hace el resto; si algo no coincide, te avisa antes de subirla.
        </p>
        <p className="text-xs">Siempre se aclara sobre la imagen que es una ambientación digital, no una fotografía real.</p>
      </InfoDialog>
    </section>
  );
}

function ModeOption({
  checked,
  onChange,
  icon,
  title,
  description,
}: {
  checked: boolean;
  onChange: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-media border p-4",
        "transition-[background-color,border-color,transform] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.99]",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40",
        checked ? "border-accent/40 bg-accent-soft" : "border-border hover:bg-surface-2"
      )}
    >
      <input type="radio" name="cover-mode" checked={checked} onChange={onChange} className="sr-only" />
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors duration-150",
          checked ? "bg-accent text-accent-contrast" : "bg-surface-2 text-text-muted"
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-text">{title}</span>
        <span className="mt-0.5 block text-sm text-text-muted">{description}</span>
      </span>
    </label>
  );
}

function UploadProgress({ progress }: { progress: AmbientUploadProgress }) {
  const label =
    progress.phase === "uploading" ? `Subiendo la portada (${progress.done} de ${progress.total})…` : PROGRESS_LABEL[progress.phase];
  const fraction = progress.phase === "verifying" ? 1 : progress.total > 0 ? progress.done / progress.total : 0;
  return (
    <div role="status" aria-live="polite" className="flex w-full flex-col items-center gap-3 py-2">
      <LoaderCircle className="h-6 w-6 animate-spin text-accent motion-reduce:animate-none" aria-hidden />
      <p className="text-sm font-medium text-text">{label}</p>
      <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full origin-left rounded-full bg-accent transition-transform duration-200 [transition-timing-function:var(--ease-out)]"
          style={{ transform: `scaleX(${Math.max(0.04, fraction)})` }}
        />
      </div>
    </div>
  );
}

function AmbientEditor({
  ambient,
  title,
  onChange,
  onReplace,
  onRemove,
}: {
  ambient: AmbientFormState;
  title: string;
  onChange: (next: AmbientFormState) => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const { cover, states, start } = ambient;
  const all = cover.manifest.states;
  const files = referencedFiles(cover.manifest);
  const total = files.reduce((sum, f) => sum + f.bytes, 0);

  function toggle(id: string) {
    const on = states.includes(id);
    if (on && states.length === 1) return; // siempre queda al menos uno
    const next = all.map((s) => s.id).filter((x) => (x === id ? !on : states.includes(x)));
    onChange({ ...ambient, states: next, start: start !== AMBIENT_START_AUTO && !next.includes(start) ? AMBIENT_START_AUTO : start });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
      {/* Se remonta al cambiar estados o inicio: es una vista previa, no se usa seguido. */}
      <AmbientCoverLazy
        key={`${states.join(",")}|${start}`}
        manifest={cover.manifest}
        baseUrl={cover.baseUrl}
        states={states}
        start={start}
        title={title}
      />

      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-text">Estados incluidos</legend>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            {all.map((s) => {
              const on = states.includes(s.id);
              const isLast = on && states.length === 1;
              return (
                <label
                  key={s.id}
                  className={cn("flex items-center gap-2 text-sm text-text", isLast ? "cursor-not-allowed opacity-60" : "cursor-pointer")}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={isLast}
                    onChange={() => toggle(s.id)}
                    className="h-4 w-4 shrink-0 accent-accent"
                  />
                  <AmbientStateIcon id={s.id} className="h-4 w-4 shrink-0 text-text-muted" />
                  {s.label}
                </label>
              );
            })}
          </div>
          <p className="text-xs text-text-muted">
            {states.length === 1 ? "Dejá al menos un estado." : "Destildá los que no quieras mostrar."}
          </p>
        </fieldset>

        <SelectField label="Empieza en" value={start} onChange={(e) => onChange({ ...ambient, start: e.target.value })}>
          <option value={AMBIENT_START_AUTO}>Según la hora de quien mira</option>
          {all
            .filter((s) => states.includes(s.id))
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
        </SelectField>

        <p className="text-xs text-text-muted">
          {files.length} archivos · {formatBytes(total)}. Sobre la imagen siempre se muestra «Ambientación digital».
        </p>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onReplace}>
            <FolderUp className="h-4 w-4" aria-hidden /> Cambiar carpeta
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="text-danger">
            <Trash2 className="h-4 w-4" aria-hidden /> Quitar
          </Button>
        </div>
      </div>
    </div>
  );
}
