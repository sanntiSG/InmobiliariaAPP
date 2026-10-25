"use client";

import { useEffect, useState } from "react";
import { CaptionCard } from "@/components/social/CaptionCard";
import type { SocialCaptionPayload } from "@/lib/social/types";

/**
 * La publicación lista: la imagen (se descubre de arriba hacia abajo al llegar) y, al lado o debajo, el texto y los hashtags
 * sugeridos para copiar. Descargar y compartir están en la barra de abajo del escenario, que siempre se ve.
 */
export function PostResult({ url, alt, caption, captionState }: { url: string; alt: string; caption: SocialCaptionPayload | null; captionState: "loading" | "ready" | "error" }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="grid items-start gap-5 sm:grid-cols-[minmax(0,17rem)_1fr]">
      <div className="agent-reveal aspect-[4/5] w-full overflow-hidden rounded-card bg-surface-2 shadow-card" data-shown={shown ? "true" : "false"}>
        {/* eslint-disable-next-line @next/next/no-img-element -- imagen en memoria (blob) dibujada por el servidor */}
        <img src={url} alt={alt} className="h-full w-full object-cover" draggable={false} />
      </div>
      <CaptionCard caption={caption} state={captionState} />
    </div>
  );
}
