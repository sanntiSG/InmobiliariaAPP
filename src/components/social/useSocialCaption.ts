"use client";

import { useEffect, useState } from "react";
import type { SocialCaptionPayload } from "@/lib/social/types";

/**
 * El texto y los hashtags sugeridos para la publicación de hoy. Se vuelven a pedir cuando cambia la publicación
 * (`key` = propiedad + versión); mientras tanto `state` es "loading". Los usan la pantalla clásica y el agente de marketing.
 */
export function useSocialCaption(key: string | null, qs: string) {
  const [result, setResult] = useState<{ key: string; data: SocialCaptionPayload | null } | null>(null);

  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    fetch(`/api/dashboard/social/caption${qs}`, { credentials: "same-origin", signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<SocialCaptionPayload>) : Promise.reject(new Error(String(r.status)))))
      .then((data) => setResult({ key, data }))
      .catch(() => !ctrl.signal.aborted && setResult({ key, data: null }));
    return () => ctrl.abort();
  }, [key, qs]);

  const fresh = key !== null && result?.key === key;
  const caption = fresh ? result.data : null;
  const state: "loading" | "ready" | "error" = !fresh ? "loading" : result.data ? "ready" : "error";
  return { caption, state };
}
