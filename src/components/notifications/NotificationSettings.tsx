"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, BellOff, Download, Share, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { NOTIFICATION_GROUP_HINTS, NOTIFICATION_GROUP_LABELS, MUTABLE_GROUPS, type NotificationGroup } from "@/config/notifications";
import { fromB64Url } from "@/lib/push/keys";
import { IOS_INSTALL_STEPS, detectDevice, pushStatus, unblockSteps, type Device, type PushStatus } from "@/lib/push/device";
import { cn } from "@/lib/utils/cn";

type Prefs = { muted: string[]; pushPaused: boolean; devices: { id: string; label: string }[] };
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const SW_URL = "/sw.js";

/** El navegador declara si tiene avisos del dispositivo. */
const hasPushApis = (): boolean => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const isStandalone = (): boolean => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Sin cuenta no hay avisos: esta pantalla sólo se muestra a quien inició sesión (lo garantiza la página que la usa). */
export function NotificationSettings({ groups, className }: { groups: NotificationGroup[]; className?: string }) {
  const [device, setDevice] = useState<Device | null>(null);
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [busy, setBusy] = useState<null | "on" | "off" | "test" | "prefs">(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const alive = useRef(true);

  /** Qué tiene este navegador ahora mismo: soporte, si está instalada, el permiso y si ya está suscripto. */
  const refresh = useCallback(async () => {
    const d = detectDevice(navigator.userAgent, { touchPoints: navigator.maxTouchPoints });
    const supported = hasPushApis();
    const permission = supported ? (Notification.permission as "default" | "granted" | "denied") : "default";
    let sub = false;
    if (supported) {
      try {
        const reg = await navigator.serviceWorker.getRegistration(SW_URL);
        sub = !!(await reg?.pushManager.getSubscription());
      } catch {
        sub = false;
      }
    }
    if (!alive.current) return;
    setDevice(d);
    setStatus(pushStatus(d, { supported, standalone: isStandalone(), permission }));
    setSubscribed(sub && permission === "granted");
  }, []);

  const loadPrefs = useCallback(async () => {
    try {
      const res = await fetch("/api/me/notification-prefs", { cache: "no-store" });
      if (res.ok && alive.current) setPrefs((await res.json()) as Prefs);
    } catch {
      // Sin conexión: se vuelve a intentar al recargar.
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    // Sincroniza con lo que declara el navegador (soporte, permiso, suscripción): sólo existe en el cliente.
    void refresh();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- idem: espera la respuesta del servidor
    void loadPrefs();
    const onInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => {
      alive.current = false;
      window.removeEventListener("beforeinstallprompt", onInstall);
    };
  }, [refresh, loadPrefs]);

  async function activate() {
    setBusy("on");
    setMessage(null);
    try {
      // 1. El permiso se pide recién ahora, después de explicar para qué sirve y de que la persona lo pidiera con un toque.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        await refresh();
        setMessage({ ok: false, text: permission === "denied" ? "No diste el permiso, así que no vamos a enviarte avisos. Podés cambiarlo cuando quieras." : "No se activó: cerraste el pedido de permiso sin elegir." });
        return;
      }
      // 2. La clave pública del servidor (si este sitio todavía no tiene los avisos activados, se dice con claridad).
      const key = ((await (await fetch("/api/push/key", { cache: "no-store" })).json()) as { publicKey: string | null }).publicKey;
      if (!key) {
        setMessage({ ok: false, text: "Los avisos del dispositivo todavía no están habilitados en este sitio (lo hace quien administra la plataforma). Mientras tanto, los ves en la campana." });
        return;
      }
      // 3. Service worker + suscripción + guardarla en la cuenta.
      const reg = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64Url(key) as BufferSource }));
      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, touchPoints: navigator.maxTouchPoints }) });
      if (!res.ok) {
        await sub.unsubscribe().catch(() => undefined);
        throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo activar el aviso.");
      }
      await refresh();
      await loadPrefs();
      setMessage({ ok: true, text: "Listo: los avisos están activados en este dispositivo." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "No se pudo activar el aviso." });
    } finally {
      setBusy(null);
    }
  }

  async function deactivate() {
    setBusy("off");
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_URL);
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined);
        await sub.unsubscribe();
      }
      await refresh();
      await loadPrefs();
      setMessage({ ok: true, text: "Desactivaste los avisos en este dispositivo. Seguís viéndolos en la campana." });
    } catch {
      setMessage({ ok: false, text: "No se pudieron desactivar. Probá de nuevo." });
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    setBusy("test");
    setMessage(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = (await res.json().catch(() => null)) as { error?: string; immediate?: boolean } | null;
      if (!res.ok) throw new Error(data?.error ?? "No se pudo enviar la prueba.");
      setMessage({ ok: true, text: data?.immediate ? "Te mandamos un aviso de prueba: debería llegar en unos segundos." : "Te mandamos un aviso de prueba: puede tardar hasta unos 5 minutos en llegar." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "No se pudo enviar la prueba." });
    } finally {
      setBusy(null);
    }
  }

  async function savePrefs(patch: Partial<Pick<Prefs, "muted" | "pushPaused">>) {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, ...patch });
    setBusy("prefs");
    try {
      const res = await fetch("/api/me/notification-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!res.ok) throw new Error();
      setPrefs((await res.json()) as Prefs);
    } catch {
      setPrefs(previous);
      setMessage({ ok: false, text: "No se pudo guardar el cambio." });
    } finally {
      setBusy(null);
    }
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    setInstallEvent(null);
    void refresh();
  }

  const toggleGroup = (g: NotificationGroup) => {
    if (!prefs) return;
    const muted = prefs.muted.includes(g) ? prefs.muted.filter((x) => x !== g) : [...prefs.muted, g];
    void savePrefs({ muted });
  };

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

        {status === null ? (
          <p className="text-sm text-text-muted" role="status">
            Revisando tu dispositivo…
          </p>
        ) : (
          <DeviceStatus status={status} device={device!} subscribed={subscribed} busy={busy} onActivate={activate} onDeactivate={deactivate} onTest={sendTest} canInstall={!!installEvent} onInstall={install} />
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
                <Toggle label={`Recibir avisos de ${NOTIFICATION_GROUP_LABELS[g].toLowerCase()}`} on={on} disabled={!mutable || !prefs || busy === "prefs"} onChange={() => toggleGroup(g)} />
              </li>
            );
          })}
          <li className="flex items-start justify-between gap-4 pt-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">Pausar los avisos del dispositivo</p>
              <p className="text-xs text-text-muted">Dejás de recibirlos en el celular o la computadora sin tocar lo de arriba. La campana sigue igual.</p>
            </div>
            <Toggle label="Pausar los avisos del dispositivo" on={!!prefs?.pushPaused} disabled={!prefs || busy === "prefs"} onChange={() => savePrefs({ pushPaused: !prefs?.pushPaused })} />
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

function Steps({ items }: { items: readonly string[] }) {
  return (
    <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-text">
      {items.map((s) => (
        <li key={s}>{s}</li>
      ))}
    </ol>
  );
}

/** Lo que le corresponde hacer a esta persona en ESTE dispositivo (sin instrucciones genéricas). */
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
        </div>
      );
    case "denied":
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-text">Bloqueaste los avisos en este navegador. Para volver a permitirlos:</p>
          <Steps items={unblockSteps(device)} />
        </div>
      );
    case "ios_install":
      return (
        <div className="flex flex-col gap-2.5">
          <p className="text-sm text-text">En iPhone y iPad los avisos sólo funcionan si agregás la plataforma a tu pantalla de inicio. Es un minuto:</p>
          <Steps items={IOS_INSTALL_STEPS} />
          <p className="flex items-center gap-1.5 text-xs text-text-muted">
            <Share className="h-3.5 w-3.5" aria-hidden /> Necesitás iOS o iPadOS 16.4 o posterior.
          </p>
        </div>
      );
    case "ios_safari":
      return <p className="text-sm text-text">En iPhone y iPad los avisos sólo se pueden activar desde Safari. Abrí esta misma dirección en Safari y seguí los pasos que te vamos a mostrar ahí.</p>;
    case "ios_old":
      return <p className="text-sm text-text">Este iPhone o iPad tiene una versión de iOS anterior a la 16.4, que no permite avisos del dispositivo. Actualizarlo lo habilita; mientras tanto, los ves en la campana.</p>;
    case "unsupported":
      return <p className="text-sm text-text">Este navegador no permite avisos del dispositivo. Probá con otro navegador actualizado (Chrome, Edge, Firefox o Safari) o seguí viéndolos en la campana.</p>;
  }
}
