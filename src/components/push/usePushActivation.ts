"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fromB64Url } from "@/lib/push/keys";
import { detectDevice, pushStatus, type Device, type PushStatus } from "@/lib/push/device";

export type PushBusy = null | "on" | "off" | "test";
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const SW_URL = "/sw.js";

/** El navegador declara si tiene avisos del dispositivo. */
const hasPushApis = (): boolean => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const isStandalone = (): boolean => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * Todo lo que hace falta para activar los avisos del dispositivo desde cualquier pantalla (los ajustes, la solicitud de una inmobiliaria,
 * "avisarme cuando se libere", seguir una inmobiliaria): qué tiene este navegador ahora mismo, si ya está suscripto y las acciones de
 * activar, desactivar, probar e instalar. El permiso del navegador se pide SÓLO dentro de `activate`, que alguien dispara con un toque.
 */
export function usePushActivation(opts: { onChange?: () => void } = {}) {
  const [device, setDevice] = useState<Device | null>(null);
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState<PushBusy>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const alive = useRef(true);
  const onChange = useRef(opts.onChange);
  useEffect(() => {
    onChange.current = opts.onChange;
  });

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

  useEffect(() => {
    alive.current = true;
    // Sincroniza con lo que declara el navegador (soporte, permiso, suscripción): sólo existe en el cliente.
    void refresh();
    const onInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => {
      alive.current = false;
      window.removeEventListener("beforeinstallprompt", onInstall);
    };
  }, [refresh]);

  const activate = useCallback(async () => {
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
      onChange.current?.();
      setMessage({ ok: true, text: "Listo: los avisos están activados en este dispositivo." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "No se pudo activar el aviso." });
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const deactivate = useCallback(async () => {
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
      onChange.current?.();
      setMessage({ ok: true, text: "Desactivaste los avisos en este dispositivo. Seguís viéndolos en la campana." });
    } catch {
      setMessage({ ok: false, text: "No se pudieron desactivar. Probá de nuevo." });
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const sendTest = useCallback(async () => {
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
  }, []);

  const install = useCallback(async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    setInstallEvent(null);
    void refresh();
  }, [installEvent, refresh]);

  return { device, status, subscribed, busy, message, canInstall: !!installEvent, activate, deactivate, sendTest, install, refresh };
}
