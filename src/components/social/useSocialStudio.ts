"use client";

import { useCallback, useState } from "react";
import type { GenerateRequest, SocialMode, SocialState } from "@/lib/social/types";

export type SocialBusy = null | "load" | "mode" | "generate";

/**
 * Hablar con el motor de "Contenido para redes" (`/api/dashboard/social`): estado, modo y generación. Lo usan la pantalla
 * clásica de Contenido para redes y el agente de marketing, así los dos hacen exactamente lo mismo sobre las mismas rutas.
 * `agencyId` sólo lo pasa el admin (para elegir inmobiliaria); las personas de una inmobiliaria siempre trabajan sobre la suya.
 */
export function useSocialStudio(agencyId: string | null, initial: SocialState | null) {
  const [state, setState] = useState<SocialState | null>(initial);
  // Sin estado inicial, el primer pedido (`load`) ya está en curso.
  const [busy, setBusy] = useState<SocialBusy>(initial ? null : "load");
  const [error, setError] = useState<string | null>(null);

  const qs = agencyId ? `?agencyId=${agencyId}` : "";
  /** Para armar URLs que ya traen otros parámetros (`...&agencyId=`). */
  const agencyParam = agencyId ? `&agencyId=${agencyId}` : "";

  const call = useCallback(
    async (path: string, init: RequestInit, kind: Exclude<SocialBusy, null>): Promise<boolean> => {
      if (kind !== "load") setBusy(kind);
      setError(null);
      try {
        const res = await fetch(`/api/dashboard/social${path}${qs}`, {
          ...init,
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Algo salió mal. Probá de nuevo.");
          return false;
        }
        setState(data as SocialState);
        return true;
      } catch {
        setError("No pudimos conectarnos. Revisá tu conexión.");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [qs]
  );

  const load = useCallback(() => call("", { method: "GET" }, "load"), [call]);
  const changeMode = useCallback((mode: SocialMode) => call("", { method: "PATCH", body: JSON.stringify({ mode }) }, "mode"), [call]);
  const generate = useCallback((req: GenerateRequest = {}) => call("/generate", { method: "POST", body: JSON.stringify(req) }, "generate"), [call]);

  return { state, busy, error, setError, qs, agencyParam, load, changeMode, generate };
}
