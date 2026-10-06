"use client";

import { useId, useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

/**
 * Logo o portada de la inmobiliaria: sube la imagen al storage de la plataforma
 * (nunca se acepta una URL externa) y devuelve la URL resultante.
 */
export function AgencyImageField({
  label,
  hint,
  kind,
  value,
  onChange,
  agencyId,
  shape = "wide",
}: {
  label: string;
  hint: string;
  kind: "logo" | "cover";
  value: string;
  onChange: (url: string) => void;
  /** Sólo para el admin: a qué inmobiliaria pertenece la imagen (carpeta de destino). */
  agencyId?: string;
  shape?: "square" | "wide";
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("kind", kind);
      if (agencyId) body.set("agencyId", agencyId);
      const res = await fetch("/api/dashboard/upload", { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "No se pudo subir la imagen.");
      onChange(data.url as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la imagen.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-medium text-text">
        {label}
      </label>
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "relative shrink-0 overflow-hidden bg-surface-2",
            shape === "square" ? "h-20 w-20 rounded-full" : "h-20 w-36 rounded-media sm:w-48"
          )}
        >
          {value ? (
            <Image src={value} alt="" fill sizes="192px" className="object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-text-muted">
              <ImagePlus className="h-6 w-6" aria-hidden />
            </span>
          )}
        </div>
        <div className="flex flex-col items-start gap-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? "Subiendo…" : value ? "Cambiar" : "Subir imagen"}
            </Button>
            {value && !uploading && (
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
                <Trash2 className="h-4 w-4" aria-hidden /> Quitar
              </Button>
            )}
          </div>
          <p className="text-xs text-text-muted">{hint}</p>
        </div>
      </div>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
