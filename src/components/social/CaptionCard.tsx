"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Hash } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { SocialCaptionPayload } from "@/lib/social/types";

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** El texto y los hashtags sugeridos para acompañar la imagen, con botones para copiarlos. */
export function CaptionCard({ caption, state }: { caption: SocialCaptionPayload | null; state: "loading" | "ready" | "error" }) {
  const [copied, setCopied] = useState<"text" | "tags" | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const flash = async (kind: "text" | "tags", text: string) => {
    if (!(await copy(text))) return;
    setCopied(kind);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 1800);
  };

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-card bg-surface p-4 shadow-card" aria-label="Texto sugerido">
      <h3 className="font-display text-base font-bold text-text">Texto para acompañarla</h3>
      {state === "loading" && <p className="text-sm text-text-muted">Preparando el texto…</p>}
      {state === "error" && <p className="text-sm text-text-muted">No pude preparar el texto ahora. La imagen está lista para descargar.</p>}
      {caption && (
        <>
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-text">{caption.text}</p>
          <ul className="flex flex-wrap gap-1.5" aria-label="Hashtags sugeridos">
            {caption.hashtags.map((h) => (
              <li key={h} className="rounded-pill bg-accent-soft px-2.5 py-1 font-mono text-xs text-accent">
                {h}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => flash("text", caption.full)}>
              {copied === "text" ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              {copied === "text" ? "Copiado" : "Copiar texto y hashtags"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => flash("tags", caption.hashtags.join(" "))}>
              {copied === "tags" ? <Check className="h-4 w-4" aria-hidden /> : <Hash className="h-4 w-4" aria-hidden />}
              {copied === "tags" ? "Copiados" : "Sólo hashtags"}
            </Button>
          </div>
          <p className="text-xs text-text-muted">Podés cambiar lo que quieras antes de publicarlo.</p>
        </>
      )}
    </section>
  );
}
