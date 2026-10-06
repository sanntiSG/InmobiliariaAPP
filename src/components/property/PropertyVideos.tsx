"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { youtubeEmbedUrl, youtubeThumbnail, type VideoOrientation } from "@/lib/media/youtube";
import { cn } from "@/lib/utils/cn";
import type { PropertyDetail } from "./types";

/**
 * Videos de YouTube de la publicación, como información extra debajo de la
 * descripción: un carrusel con desplazamiento por snap. Los Shorts se ven en
 * vertical (9:16) y los demás en horizontal (16:9), cada uno en su proporción.
 *
 * Fluidez en mobile: cada video es sólo una miniatura con un botón de play; el
 * reproductor (iframe pesado, con scripts de terceros) se carga recién cuando
 * la persona lo toca, y sin cookies de seguimiento (youtube-nocookie).
 */
export function PropertyVideos({ videos }: { videos: PropertyDetail["videos"] }) {
  if (videos.length === 0) return null;

  return (
    <section aria-labelledby="property-videos-title">
      <h2 id="property-videos-title" className="font-display text-lg font-semibold text-text">
        Videos
      </h2>
      <ul
        className="-mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0 [scrollbar-width:thin]"
        aria-label="Videos de la propiedad"
      >
        {videos.map((video, i) => (
          <li
            key={video.videoId}
            className={cn("shrink-0 snap-start", video.orientation === "vertical" ? "w-[56vw] max-w-[260px]" : "w-[82vw] max-w-[440px]")}
          >
            <VideoPlayer videoId={video.videoId} title={video.title || `Video ${i + 1}`} orientation={video.orientation} />
            {video.title && <p className="mt-2 line-clamp-2 text-sm text-text-muted">{video.title}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function VideoPlayer({ videoId, title, orientation }: { videoId: string; title: string; orientation: VideoOrientation }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-card bg-surface-2 shadow-card",
        orientation === "vertical" ? "aspect-[9/16]" : "aspect-video"
      )}
    >
      {playing ? (
        <iframe
          src={youtubeEmbedUrl(videoId)}
          title={title}
          className="absolute inset-0 h-full w-full"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Reproducir: ${title}`}
          className="group absolute inset-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={youtubeThumbnail(videoId)} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute inset-0 bg-black/10 transition-colors duration-200 group-hover:bg-black/25" aria-hidden />
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-black shadow-float transition-transform duration-150 [transition-timing-function:var(--ease-out)] group-hover:scale-105 group-active:scale-95">
            <Play className="ml-0.5 h-6 w-6" fill="currentColor" aria-hidden />
          </span>
        </button>
      )}
    </div>
  );
}
