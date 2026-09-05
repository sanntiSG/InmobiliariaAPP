"use client";

import { useRef, useState } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/utils/cn";

export type UploadedImage = { url: string; alt: string; order: number; providerId?: string };

export function ImageUploader({
  images,
  onChange,
  agencyId,
}: {
  images: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  /** Solo relevante para el admin: sube la foto a la carpeta de esta inmobiliaria. */
  agencyId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);

    const uploaded: UploadedImage[] = [];
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      if (agencyId) formData.append("agencyId", agencyId);
      try {
        const res = await fetch("/api/dashboard/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Error al subir la imagen");
        uploaded.push({ url: data.url, alt: "", order: 0, providerId: data.providerId });
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo subir una imagen.");
      }
    }

    const merged = [...images, ...uploaded].map((img, i) => ({ ...img, order: i }));
    onChange(merged);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(index: number) {
    onChange(images.filter((_, i) => i !== index).map((img, i) => ({ ...img, order: i })));
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next.map((img, i) => ({ ...img, order: i })));
  }

  return (
    <div>
      {images.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((img, i) => (
            <div key={img.url + i} className="group relative aspect-[4/3] overflow-hidden rounded-media bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 flex items-start justify-between p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="flex gap-1">
                  <MiniButton onClick={() => move(i, -1)} disabled={i === 0} label="Mover antes">
                    ←
                  </MiniButton>
                  <MiniButton onClick={() => move(i, 1)} disabled={i === images.length - 1} label="Mover después">
                    →
                  </MiniButton>
                </div>
                <IconButton size={26} variant="solid" aria-label="Quitar foto" onClick={() => remove(i)}>
                  <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden>
                    <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </IconButton>
              </div>
              {i === 0 && (
                <span className="absolute bottom-1.5 left-1.5 rounded-pill bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
                  Portada
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <label
        className={cn(
          "flex h-24 cursor-pointer items-center justify-center rounded-media border-2 border-dashed border-border text-sm text-text-muted",
          "transition-colors hover:border-accent hover:text-accent"
        )}
      >
        {uploading ? "Subiendo…" : "+ Agregar fotos (JPG, PNG, WEBP, HEIC — máx. 8MB c/u)"}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={uploading}
        />
      </label>
      {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
    </div>
  );
}

function MiniButton({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white disabled:opacity-30"
    >
      {children}
    </button>
  );
}
