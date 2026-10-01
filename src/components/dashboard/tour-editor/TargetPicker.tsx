"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { sceneName, type TourScene } from "@/components/tour/tour-types";

/**
 * Elige a qué foto 360° lleva un marcador: una de las ya cargadas en la
 * propiedad o una nueva (se sube en el momento).
 */
export function TargetPicker({
  scenes,
  excludeId,
  canUpload,
  onPick,
  onUpload,
  onClose,
}: {
  scenes: TourScene[];
  /** La escena actual — un marcador no puede apuntar a sí misma. */
  excludeId: string;
  canUpload: boolean;
  onPick: (sceneId: string) => void;
  /** Sube una foto nueva y devuelve el id de la escena creada. */
  onUpload: (file: File) => Promise<string>;
  onClose: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      onPick(await onUpload(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la foto 360°.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Elegir foto de destino"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-6"
    >
      <div className="flex max-h-[85dvh] w-full max-w-xl flex-col rounded-t-card bg-bg shadow-card sm:rounded-card">
        <div className="flex items-center justify-between px-4 pb-2 pt-4 sm:px-5">
          <h3 className="font-display text-base font-semibold text-text">¿A qué foto lleva este marcador?</h3>
          <IconButton aria-label="Cerrar" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden />
          </IconButton>
        </div>

        <div className="grid grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3 sm:px-5">
          {scenes.map((s, i) =>
            s.id === excludeId ? null : (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(s.id)}
                className="group flex flex-col gap-1.5 text-left transition-transform duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.97]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.photo360Url}
                  alt=""
                  loading="lazy"
                  className="aspect-[16/10] w-full rounded-media bg-surface-2 object-cover ring-accent/0 transition-shadow group-hover:ring-2 group-hover:ring-accent"
                />
                <span className="truncate text-sm font-medium text-text">{sceneName(s, i)}</span>
              </button>
            )
          )}

          {canUpload && (
            <label className="flex aspect-[16/10] cursor-pointer flex-col items-center justify-center gap-1 rounded-media border-2 border-dashed border-border text-center text-xs text-text-muted transition-colors hover:border-accent hover:text-accent">
              {uploading ? (
                "Subiendo…"
              ) : (
                <>
                  <Plus className="h-4 w-4" aria-hidden /> Subir foto nueva
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  void handleFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>

        {error && (
          <p className="px-4 pb-4 text-sm text-danger sm:px-5" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
