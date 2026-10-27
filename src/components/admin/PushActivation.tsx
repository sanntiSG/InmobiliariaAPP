"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { generateVapidKeys, type VapidKeys } from "@/lib/push/keys";
import type { PushStatusView } from "@/lib/push/status";
import { cn } from "@/lib/utils/cn";

/**
 * El panel del admin para activar los avisos del dispositivo. Genera el par de claves VAPID EN ESTE NAVEGADOR (la privada nunca viaja
 * a ningún servidor de la plataforma) y explica cómo cargarlas, una sola vez, en Netlify —el mismo lugar de la clave del correo—.
 * Con las claves cargadas la plataforma envía sola; sin ellas todo lo demás sigue funcionando y los avisos quedan en la campana.
 */
export function PushActivation({ status }: { status: PushStatusView }) {
  const [keys, setKeys] = useState<VapidKeys | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setKeys(await generateVapidKeys());
    } catch {
      setError("Este navegador no pudo generar las claves. Probá con uno actualizado.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(name: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(name);
      setTimeout(() => setCopied((c) => (c === name ? null : c)), 1800);
    } catch {
      setError("No se pudo copiar: seleccioná el texto y copialo a mano.");
    }
  }

  const stat = (n: number, label: string) => (
    <div className="rounded-media bg-surface-2 px-4 py-3">
      <p className="font-mono text-xl font-semibold text-text">{n}</p>
      <p className="text-xs text-text-muted">{label}</p>
    </div>
  );

  return (
    <section aria-labelledby="push-admin" className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent" aria-hidden>
          <KeyRound className="h-5 w-5" />
        </span>
        <div>
          <h2 id="push-admin" className="font-display text-lg font-bold text-text">
            Avisos del dispositivo (push)
          </h2>
          <p className="mt-0.5 text-sm text-text-muted">
            {status.canSendHere ? "Este servidor tiene las claves y puede enviar avisos." : "Este servidor todavía no tiene las claves: los avisos no salen hasta cargarlas (la campana de la plataforma funciona igual)."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat(status.people, status.people === 1 ? "persona con avisos" : "personas con avisos")}
        {stat(status.devices, status.devices === 1 ? "dispositivo" : "dispositivos")}
        {stat(status.pending, "avisos esperando salir")}
        {stat(status.failedLastDay, "con error (24 h)")}
      </div>

      {!keys ? (
        <div className="flex flex-col gap-2">
          <Button onClick={generate} disabled={busy} className="w-fit">
            {busy ? "Generando…" : status.canSendHere ? "Generar un par nuevo (reemplazar)" : "Generar las claves"}
          </Button>
          {status.canSendHere && <p className="text-xs text-text-muted">Si cambiás las claves, quienes ya activaron los avisos tienen que volver a activarlos. Sólo hacelo si hace falta.</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="rounded-media bg-warning-soft px-3.5 py-2.5 text-sm text-text">
            <strong className="font-semibold">Copialas ahora.</strong> La clave privada no se vuelve a mostrar ni se guarda en ningún servidor.
          </p>
          {(
            [
              ["VAPID_PUBLIC_KEY", keys.publicKey],
              ["VAPID_PRIVATE_KEY", keys.privateKey],
            ] as const
          ).map(([name, value]) => (
            <div key={name} className="flex flex-col gap-1">
              <p className="font-mono text-xs font-medium text-text-muted">{name}</p>
              <div className="flex items-stretch gap-2">
                <code className="min-w-0 flex-1 select-all break-all rounded-media bg-surface-sunken px-3 py-2 font-mono text-xs text-text">{value}</code>
                <Button size="sm" variant="secondary" onClick={() => copy(name, value)} aria-label={`Copiar ${name}`}>
                  {copied === name ? <Check className="h-4 w-4 text-success" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                </Button>
              </div>
            </div>
          ))}
          <ol className={cn("flex list-decimal flex-col gap-1.5 pl-5 text-sm text-text")}>
            <li>
              En Netlify entrá a <strong className="font-semibold">Site configuration → Environment variables</strong>.
            </li>
            <li>
              Agregá <code className="font-mono text-xs">VAPID_PUBLIC_KEY</code> y <code className="font-mono text-xs">VAPID_PRIVATE_KEY</code> con esos valores (sólo en Netlify: Render no hace falta).
            </li>
            <li>Publicá de nuevo el sitio (Deploys → Trigger deploy). Esta pantalla pasa a decir que el servidor puede enviar avisos.</li>
          </ol>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
