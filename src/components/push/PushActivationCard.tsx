"use client";

import { BellRing, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils/cn";
import { PushGuide } from "./guide/PushGuide";
import { usePushActivation } from "./usePushActivation";

/** Desde dónde se muestra: cambia el texto (para qué sirve activar los avisos en ese momento), no lo que hay que hacer. */
export type ActivationContext = "agency_request" | "watch" | "follow";

const COPY: Record<ActivationContext, { title: string; body: string }> = {
  agency_request: {
    title: "Enterate apenas aprueben tu solicitud",
    body: `Activá los avisos y te llega un aviso a este dispositivo cuando el equipo apruebe tu inmobiliaria, aunque no tengas ${brand.name} abierta.`,
  },
  watch: {
    title: "Que te llegue aunque no estés acá",
    body: "Activá los avisos del dispositivo y te llegan apenas se libere esta propiedad.",
  },
  follow: {
    title: "Enterate de sus novedades",
    body: "Activá los avisos y te llegan las propiedades nuevas de las inmobiliarias que seguís.",
  },
};

/**
 * Una tarjeta que invita a activar los avisos del dispositivo en el momento en que más sentido tiene (después de pedir los permisos
 * de una inmobiliaria, de pedir que te avisen cuando se libere una propiedad o de seguir una inmobiliaria), adaptada a ESTE
 * dispositivo: el botón si ya se puede, o la guía ilustrada paso a paso si hace falta instalar la app (iPhone), desbloquear los avisos
 * o usar otro navegador. Si ya están activos no aparece. El permiso del navegador se pide sólo al tocar "Activar avisos".
 */
export function PushActivationCard({ context, className }: { context: ActivationContext; className?: string }) {
  const p = usePushActivation();
  if (p.status === null || p.device === null || p.subscribed) return null;
  const { status, device } = p;
  const copy = COPY[context];

  // Este dispositivo no puede recibir avisos fuera de la plataforma: sólo importa decirlo cuando se espera una respuesta (la solicitud).
  if (status.kind === "unsupported" || status.kind === "ios_old") {
    if (context !== "agency_request") return null;
    return (
      <p className={cn("rounded-media bg-surface-2 px-4 py-3 text-sm text-text-muted", className)}>
        {status.kind === "ios_old"
          ? "Este iPhone o iPad tiene una versión de iOS anterior a la 16.4 y no recibe avisos fuera de la plataforma. Vas a ver la respuesta en la campana cuando entres."
          : "Este navegador no permite avisos fuera de la plataforma. Vas a ver la respuesta en la campana cuando entres."}
      </p>
    );
  }

  const canActivate = status.kind === "ready" || status.kind === "granted";
  return (
    <section aria-label="Avisos en tu dispositivo" className={cn("flex flex-col gap-4 rounded-card bg-surface-2 p-5 text-left", className)}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent" aria-hidden>
          <Smartphone className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-display text-base font-bold text-text">{copy.title}</h3>
          <p className="mt-0.5 text-sm text-text-muted">{copy.body}</p>
        </div>
      </div>

      {canActivate ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={p.activate} disabled={p.busy !== null}>
              <BellRing className="h-4 w-4" aria-hidden /> {p.busy === "on" ? "Activando…" : "Activar avisos"}
            </Button>
            <p className="text-xs text-text-muted">Te vamos a pedir permiso. Si no querés, seguís viéndolo en la campana.</p>
          </div>
          <details className="group rounded-media bg-surface px-4 py-3">
            <summary className="cursor-pointer list-none text-sm font-medium text-text marker:content-none">¿Qué voy a ver en la pantalla?</summary>
            <PushGuide kind={status.kind} device={device} compact className="mt-3" />
          </details>
        </div>
      ) : (
        <PushGuide kind={status.kind} device={device} compact />
      )}

      {p.message && (
        <p role={p.message.ok ? "status" : "alert"} className={cn("rounded-media px-3.5 py-2.5 text-sm", p.message.ok ? "bg-success-soft text-text" : "bg-warning-soft text-text")}>
          {p.message.text}
        </p>
      )}
    </section>
  );
}
