"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, BellOff, Download, Share, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PushGuide } from "@/components/push/guide/PushGuide";
import { usePushActivation, type PushBusy } from "@/components/push/usePushActivation";
import { NOTIFICATION_GROUP_HINTS, NOTIFICATION_GROUP_LABELS, MUTABLE_GROUPS, type NotificationGroup } from "@/config/notifications";
import type { Device, PushStatus } from "@/lib/push/device";
import { cn } from "@/lib/utils/cn";

type Prefs = { muted: string[]; pushPaused: boolean; devices: { id: string; label: string }[] };

/** Sin cuenta no hay avisos: esta pantalla sólo se muestra a quien inició sesión (lo garantiza la página que la usa). */
export function NotificationSettings({ groups, className }: { groups: NotificationGroup[]; className?: string }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [prefsBusy, setPrefsBusy] = useState(false);
  const [prefsMessage, setPrefsMessage] = useState<string | null>(null);
  const alive = useRef(true);

  const loadPrefs = useCallback(async () => {
    try {
      const res = await fetch("/api/me/notification-prefs", { cache: "no-store" });
      if (res.ok && alive.current) setPrefs((await res.json()) as Prefs);
    } catch {
      // Sin conexión: se vuelve a intentar al recargar.
    }
  }, []);

  // Activar, probar y desactivar el dispositivo: la misma lógica que en las demás pantallas (ver `usePushActivation`).
  const push = usePushActivation({ onChange: loadPrefs });

  useEffect(() => {
    alive.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con lo que guardó el servidor (sólo existe al cargar)
    void loadPrefs();
    return () => {
      alive.current = false;
    };
  }, [loadPrefs]);

  async function savePrefs(patch: Partial<Pick<Prefs, "muted" | "pushPaused">>) {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, ...patch });
    setPrefsBusy(true);
    setPrefsMessage(null);
    try {
      const res = await fetch("/api/me/notification-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!res.ok) throw new Error();
      setPrefs((await res.json()) as Prefs);
    } catch {
      setPrefs(previous);
      setPrefsMessage("No se pudo guardar el cambio.");
    } finally {
      setPrefsBusy(false);
    }
  }

  const toggleGroup = (g: NotificationGroup) => {
    if (!prefs) return;
    const muted = prefs.muted.includes(g) ? prefs.muted.filter((x) => x !== g) : [...prefs.muted, g];
    void savePrefs({ muted });
  };

  const message = push.message ?? (prefsMessage ? { ok: false, text: prefsMessage } : null);
  const busy: PushBusy | "prefs" = push.busy ?? (prefsBusy ? "prefs" : null);

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <section aria-labelledby="push-title" className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent" aria-hidden>
            <Smartphone className="h-5 w-5" />
          </span>
          <div>
            <h2 id="push-title" className="font-display text-lg font-bold text-text">
              Avisos en este dispositivo
            </h2>
            <p className="mt-0.5 text-sm text-text-muted">Recibí un aviso en tu pantalla cuando pase algo que te importa, aunque no tengas la plataforma abierta. Los avisos de la campana siguen funcionando igual.</p>
          </div>
        </div>

        {push.status === null || push.device === null ? (
          <p className="text-sm text-text-muted" role="status">
            Revisando tu dispositivo…
          </p>
        ) : (
          <DeviceStatus status={push.status} device={push.device} subscribed={push.subscribed} busy={busy} onActivate={push.activate} onDeactivate={push.deactivate} onTest={push.sendTest} canInstall={push.canInstall} onInstall={push.install} />
        )}

        {message && (
          <p role={message.ok ? "status" : "alert"} className={cn("rounded-media px-3.5 py-2.5 text-sm", message.ok ? "bg-success-soft text-text" : "bg-warning-soft text-text")}>
            {message.text}
          </p>
        )}
      </section>

      <section aria-labelledby="prefs-title" className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
        <div>
          <h2 id="prefs-title" className="font-display text-lg font-bold text-text">
            Qué avisos querés recibir
          </h2>
          <p className="mt-0.5 text-sm text-text-muted">Lo que apagues no te llega ni a la campana ni al dispositivo.</p>
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {groups.map((g) => {
            const mutable = MUTABLE_GROUPS.includes(g);
            const on = !prefs?.muted.includes(g);
            return (
              <li key={g} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text">{NOTIFICATION_GROUP_LABELS[g]}</p>
                  <p className="text-xs text-text-muted">{NOTIFICATION_GROUP_HINTS[g]}</p>
                </div>
                <Toggle label={`Recibir avisos de ${NOTIFICATION_GROUP_LABELS[g].toLowerCase()}`} on={on} disabled={!mutable || !prefs || prefsBusy} onChange={() => toggleGroup(g)} />
              </li>
            );
          })}
          <li className="flex items-start justify-between gap-4 pt-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">Pausar los avisos del dispositivo</p>
              <p className="text-xs text-text-muted">Dejás de recibirlos en el celular o la computadora sin tocar lo de arriba. La campana sigue igual.</p>
            </div>
            <Toggle label="Pausar los avisos del dispositivo" on={!!prefs?.pushPaused} disabled={!prefs || prefsBusy} onChange={() => savePrefs({ pushPaused: !prefs?.pushPaused })} />
          </li>
        </ul>
        {prefs && prefs.devices.length > 0 && (
          <p className="text-xs text-text-muted">
            Dispositivos con avisos activos: <span className="font-medium text-text">{prefs.devices.map((d) => d.label).join(", ")}</span>.
          </p>
        )}
      </section>
    </div>
  );
}

/** Un interruptor accesible (casilla con rol de switch). */
function Toggle({ label, on, disabled, onChange }: { label: string; on: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-150 [transition-timing-function:var(--ease-out)] disabled:opacity-50 pointer-coarse:h-8 pointer-coarse:w-14",
        on ? "bg-accent" : "bg-surface-3"
      )}
    >
      <span className={cn("inline-block size-5 rounded-full bg-white shadow-pop transition-transform duration-150 [transition-timing-function:var(--ease-out)] pointer-coarse:size-6", on ? "translate-x-6 pointer-coarse:translate-x-7" : "translate-x-1")} />
    </button>
  );
}

/** Lo que le corresponde hacer a esta persona en ESTE dispositivo, con la guía ilustrada paso a paso (sin instrucciones genéricas). */
function DeviceStatus({
  status,
  device,
  subscribed,
  busy,
  onActivate,
  onDeactivate,
  onTest,
  canInstall,
  onInstall,
}: {
  status: PushStatus;
  device: Device;
  subscribed: boolean;
  busy: null | "on" | "off" | "test" | "prefs";
  onActivate: () => void;
  onDeactivate: () => void;
  onTest: () => void;
  canInstall: boolean;
  onInstall: () => void;
}) {
  if (subscribed) {
    return (
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-text">
          <BellRing className="h-4 w-4 text-success" aria-hidden /> Los avisos están activados en este dispositivo.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={onTest} disabled={busy !== null}>
            {busy === "test" ? "Enviando…" : "Enviarme una prueba"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDeactivate} disabled={busy !== null}>
            <BellOff className="h-4 w-4" aria-hidden /> Desactivar acá
          </Button>
        </div>
      </div>
    );
  }
  switch (status.kind) {
    case "ready":
    case "granted":
      return (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text">Te vamos a pedir permiso al tocar el botón. Si no querés, no pasa nada: seguís viendo todo en la campana.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onActivate} disabled={busy !== null}>
              <BellRing className="h-4 w-4" aria-hidden /> {busy === "on" ? "Activando…" : "Activar avisos"}
            </Button>
            {canInstall && (
              <Button variant="secondary" onClick={onInstall}>
                <Download className="h-4 w-4" aria-hidden /> Instalar la aplicación
              </Button>
            )}
          </div>
          <details className="rounded-media bg-surface-2 px-4 py-3">
            <summary className="cursor-pointer list-none text-sm font-medium text-text marker:content-none">¿Qué voy a ver en la pantalla?</summary>
            <PushGuide kind={status.kind} device={device} compact className="mt-3" />
          </details>
        </div>
      );
    case "denied":
      return (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text">Bloqueaste los avisos en este navegador. Para volver a permitirlos:</p>
          <PushGuide kind="denied" device={device} />
        </div>
      );
    case "ios_install":
      return (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text">En iPhone y iPad los avisos sólo funcionan si agregás la plataforma a tu pantalla de inicio. Es un minuto:</p>
          <PushGuide kind="ios_install" device={device} />
          <p className="flex items-center justify-center gap-1.5 text-xs text-text-muted">
            <Share className="h-3.5 w-3.5" aria-hidden /> Necesitás iOS o iPadOS 16.4 o posterior.
          </p>
        </div>
      );
    case "ios_safari":
      return (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text">En iPhone y iPad los avisos sólo se pueden activar desde Safari. Abrí esta misma dirección en Safari y seguí estos pasos:</p>
          <PushGuide kind="ios_safari" device={device} />
        </div>
      );
    case "ios_old":
      return <p className="text-sm text-text">Este iPhone o iPad tiene una versión de iOS anterior a la 16.4, que no permite avisos del dispositivo. Actualizarlo lo habilita; mientras tanto, los ves en la campana.</p>;
    case "unsupported":
      return <p className="text-sm text-text">Este navegador no permite avisos del dispositivo. Probá con otro navegador actualizado (Chrome, Edge, Firefox o Safari) o seguí viéndolos en la campana.</p>;
  }
}
