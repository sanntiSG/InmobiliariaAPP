"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Plus, X } from "lucide-react";
import { FormField } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Badge } from "@/components/ui/Badge";
import { MAX_VIDEOS } from "@/lib/validation/property";
import { parseYouTubeVideoUrl, youtubeThumbnail, type VideoOrientation } from "@/lib/media/youtube";
import { cn } from "@/lib/utils/cn";

export type VideoFormRow = { videoId: string; title: string; orientation: VideoOrientation };

type ChannelVideo = { videoId: string; title: string; orientation: VideoOrientation };
type ChannelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; linked: boolean; videos: ChannelVideo[]; channelTitle?: string }
  | { status: "error"; message: string };

/**
 * Videos de YouTube de una publicación: elegidos del canal vinculado de la
 * inmobiliaria, o pegando el link de un video suelto (se verifica que exista y
 * se pueda incrustar). Los videos se muestran en la ficha, debajo de la
 * descripción — separados de las fotos y el recorrido 360°.
 */
export function PropertyVideosField({
  videos,
  onChange,
  agencyId,
}: {
  videos: VideoFormRow[];
  onChange: (videos: VideoFormRow[]) => void;
  /** Sólo el admin: inmobiliaria elegida en el formulario (su canal es el que se consulta). */
  agencyId?: string;
}) {
  const [pasted, setPasted] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [channel, setChannel] = useState<ChannelState>({ status: "idle" });

  const full = videos.length >= MAX_VIDEOS;
  const selected = new Set(videos.map((v) => v.videoId));

  function add(video: VideoFormRow) {
    if (selected.has(video.videoId) || full) return;
    onChange([...videos, video]);
  }

  function remove(videoId: string) {
    onChange(videos.filter((v) => v.videoId !== videoId));
  }

  async function addPasted() {
    setAddError(null);
    const parsed = parseYouTubeVideoUrl(pasted);
    if (!parsed) {
      setAddError("Pegá un link de YouTube válido (youtube.com/watch…, youtu.be/… o youtube.com/shorts/…).");
      return;
    }
    if (selected.has(parsed.videoId)) {
      setAddError("Ese video ya está agregado.");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`/api/dashboard/youtube/resolve?url=${encodeURIComponent(pasted.trim())}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "No se pudo verificar el video.");
      add({ videoId: data.videoId, title: data.title, orientation: data.orientation });
      setPasted("");
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "No se pudo verificar el video.");
    } finally {
      setAdding(false);
    }
  }

  async function loadChannel() {
    setChannel({ status: "loading" });
    try {
      const qs = agencyId ? `?agencyId=${encodeURIComponent(agencyId)}` : "";
      const res = await fetch(`/api/dashboard/youtube/videos${qs}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "No se pudieron cargar los videos del canal.");
      setChannel({ status: "ready", linked: !!data.linked, videos: data.videos ?? [], channelTitle: data.channelTitle });
    } catch (err) {
      setChannel({ status: "error", message: err instanceof Error ? err.message : "No se pudieron cargar los videos." });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-text-muted">
        Sumá videos tipo shorts (recorridos, mostrar la casa…). Se ven en la ficha, más abajo que las fotos y el
        recorrido 360°. Hasta {MAX_VIDEOS} por publicación.
      </p>

      {videos.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {videos.map((v) => (
            <li key={v.videoId} className="relative overflow-hidden rounded-media border border-border bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={youtubeThumbnail(v.videoId)}
                alt=""
                loading="lazy"
                className={cn("w-full object-cover", v.orientation === "vertical" ? "aspect-[9/16]" : "aspect-video")}
              />
              <div className="p-2.5">
                <p className="line-clamp-2 text-xs font-medium text-text">{v.title || "Video de YouTube"}</p>
                <Badge className="mt-1.5">{v.orientation === "vertical" ? "Short" : "Horizontal"}</Badge>
              </div>
              <IconButton
                size={28}
                aria-label={`Quitar ${v.title || "el video"}`}
                className="absolute right-1.5 top-1.5"
                onClick={() => remove(v.videoId)}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <FormField
              label="Pegar link de YouTube"
              placeholder="https://www.youtube.com/shorts/…"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              onKeyDown={(e) => {
                // Enter acá agregaba el video, pero también enviaba todo el formulario de la propiedad.
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (pasted.trim() && !adding && !full) void addPasted();
                }
              }}
            />
          </div>
          <Button type="button" variant="secondary" disabled={adding || full || !pasted.trim()} onClick={addPasted}>
            <Plus className="h-4 w-4" aria-hidden /> {adding ? "Verificando…" : "Agregar"}
          </Button>
        </div>
        {addError && (
          <p className="text-sm text-danger" role="alert">
            {addError}
          </p>
        )}
        {full && <p className="text-sm text-text-muted">Llegaste al máximo de {MAX_VIDEOS} videos.</p>}
      </div>

      <div className="flex flex-col gap-3 rounded-media border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-text">Elegir de tu canal de YouTube</p>
          <Button type="button" variant="secondary" size="sm" onClick={loadChannel} disabled={channel.status === "loading"}>
            {channel.status === "loading" ? "Cargando…" : channel.status === "ready" ? "Actualizar" : "Ver videos de mi canal"}
          </Button>
        </div>

        {channel.status === "error" && (
          <p className="text-sm text-danger" role="alert">
            {channel.message}
          </p>
        )}

        {channel.status === "ready" && !channel.linked && (
          <p className="text-sm text-text-muted">
            Todavía no vinculaste tu canal.{" "}
            <Link href="/dashboard/inmobiliaria" className="font-medium text-accent hover:underline">
              Vincularlo desde Mi inmobiliaria
            </Link>
            {" — o pegá el link de un video arriba."}
          </p>
        )}

        {channel.status === "ready" && channel.linked && channel.videos.length === 0 && (
          <p className="text-sm text-text-muted">No encontramos videos públicos en tu canal.</p>
        )}

        {channel.status === "ready" && channel.videos.length > 0 && (
          <>
            <p className="text-xs text-text-muted">
              Últimos videos de {channel.channelTitle || "tu canal"}. Para uno más viejo, pegá su link arriba.
            </p>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {channel.videos.map((v) => {
                const isSelected = selected.has(v.videoId);
                return (
                  <li key={v.videoId}>
                    <button
                      type="button"
                      onClick={() => (isSelected ? remove(v.videoId) : add(v))}
                      disabled={!isSelected && full}
                      aria-pressed={isSelected}
                      className={cn(
                        "group relative flex w-full flex-col overflow-hidden rounded-media border text-left transition-[transform,border-color] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.98] disabled:opacity-50",
                        isSelected ? "border-accent" : "border-border hover:border-accent"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={youtubeThumbnail(v.videoId)}
                        alt=""
                        loading="lazy"
                        className={cn("w-full object-cover", v.orientation === "vertical" ? "aspect-[9/16]" : "aspect-video")}
                      />
                      <span className="line-clamp-2 p-2 text-xs text-text">{v.title}</span>
                      {isSelected && (
                        <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-contrast">
                          <Check className="h-3.5 w-3.5" aria-hidden />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
