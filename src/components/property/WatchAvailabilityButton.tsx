"use client";

import { useState } from "react";
import Link from "next/link";
import { BellRing, BellOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PushActivationCard } from "@/components/push/PushActivationCard";

/**
 * "Avisarme cuando se libere": se activa y se desactiva con un toque. Sin cuenta lleva a ingresar (y vuelve a esta ficha). El aviso
 * llega como notificación dentro de la plataforma —y como notificación del dispositivo si la persona la activó—.
 */
export function WatchAvailabilityButton({ propertyId, isAuthenticated, initialWatching, returnTo }: { propertyId: string; isAuthenticated: boolean; initialWatching: boolean; returnTo: string }) {
  const [watching, setWatching] = useState(initialWatching);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col gap-1.5">
        <Link href={`/ingresar?callbackUrl=${encodeURIComponent(returnTo)}`} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-pill bg-surface-2 px-4 text-sm font-semibold text-text transition-colors hover:bg-surface-3">
          <BellRing className="h-4 w-4" aria-hidden /> Avisarme cuando se libere
        </Link>
        <p className="text-xs text-text-muted">Ingresá con tu cuenta para recibir el aviso.</p>
      </div>
    );
  }

  async function toggle() {
    if (busy) return;
    const next = !watching;
    setBusy(true);
    setError(null);
    setWatching(next);
    try {
      const res = await fetch(`/api/properties/${propertyId}/availability-watch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ watching: next }) });
      const data = (await res.json().catch(() => null)) as { error?: string; watching?: boolean } | null;
      if (!res.ok) throw new Error(data?.error ?? "No se pudo guardar el aviso.");
      setWatching(!!data?.watching);
    } catch (err) {
      setWatching(!next);
      setError(err instanceof Error ? err.message : "No se pudo guardar el aviso.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button type="button" variant={watching ? "secondary" : "primary"} size="sm" onClick={toggle} disabled={busy} aria-pressed={watching}>
        {watching ? <BellOff className="h-4 w-4" aria-hidden /> : <BellRing className="h-4 w-4" aria-hidden />}
        {watching ? "Dejar de avisarme" : "Avisarme cuando se libere"}
      </Button>
      {watching && <p className="text-xs text-text-muted">Listo: te avisamos apenas esté disponible.</p>}
      {watching && <PushActivationCard context="watch" className="mt-2 max-w-md" />}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
