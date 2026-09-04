"use client";

import { useRef, useState } from "react";
import { IconButton } from "@/components/ui/IconButton";

export type MeshFormat = "glb" | "gltf" | "usdz";
export type MeshValue = { url: string; format: MeshFormat } | null;

const EXT_TO_FORMAT: Record<string, MeshFormat> = {
  ".glb": "glb",
  ".gltf": "gltf",
  ".usdz": "usdz",
};

export function MeshUploader({ value, onChange }: { value: MeshValue; onChange: (v: MeshValue) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);

    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    const format = EXT_TO_FORMAT[ext];
    if (!format) {
      setError("Formato no soportado. Usá .glb, .gltf o .usdz.");
      setUploading(false);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("kind", "mesh");

    try {
      const res = await fetch("/api/dashboard/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo subir el archivo");
      onChange({ url: data.url, format });
      setFileName(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir el archivo.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-media border border-border bg-surface-2 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-text">
          <MeshIcon />
          <span className="truncate">{fileName ?? `Archivo 3D (${value.format.toUpperCase()})`}</span>
        </div>
        <IconButton
          size={28}
          aria-label="Quitar archivo 3D"
          onClick={() => {
            onChange(null);
            setFileName(null);
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden>
            <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </IconButton>
      </div>
    );
  }

  return (
    <div>
      <label className="flex h-16 cursor-pointer items-center justify-center rounded-media border-2 border-dashed border-border text-sm text-text-muted transition-colors hover:border-accent hover:text-accent">
        {uploading ? "Subiendo…" : "+ Subir escaneo 3D (.glb, .gltf, .usdz — máx. 30MB)"}
        <input
          ref={inputRef}
          type="file"
          accept=".glb,.gltf,.usdz"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
          disabled={uploading}
        />
      </label>
      {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
    </div>
  );
}

function MeshIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" aria-hidden>
      <path
        d="M12 2 3 7v10l9 5 9-5V7l-9-5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M3 7l9 5 9-5M12 12v10" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
