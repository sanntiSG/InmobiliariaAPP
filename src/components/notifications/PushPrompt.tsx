"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRing, X } from "lucide-react";
import { detectDevice, pushStatus } from "@/lib/push/device";
import { cn } from "@/lib/utils/cn";

const KEY = "push-prompt-dismissed-at";
const HIDE_DAYS = 14;

/**
 * Un recordatorio suave, UNA vez cada 14 días como máximo, para quien todavía no activó los avisos del dispositivo y su navegador
 * puede: explica para qué sirve y lleva a los ajustes. Nunca pide el permiso por su cuenta (eso sólo pasa al tocar "Activar avisos"
 * allá) y "Ahora no" lo oculta. Si el dispositivo no puede recibir avisos o ya los tiene, no se muestra.
 */
export function PushPrompt({ href = "#avisos", className }: { href?: string; className?: string }) {
  const [show, setShow] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const last = Number(localStorage.getItem(KEY) ?? 0);
        if (last && Date.now() - last < HIDE_DAYS * 86_400_000) return;
      } catch {
        // Sin almacenamiento (ventana privada): se muestra igual.
      }
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const device = detectDevice(navigator.userAgent, { touchPoints: navigator.maxTouchPoints });
      const status = pushStatus(device, { supported, standalone, permission: supported ? (Notification.permission as "default" | "granted" | "denied") : "default" });
      // En iPhone con Safari sin instalar también conviene mostrarlo: ahí le explicamos cómo instalarla.
      if (status.kind !== "ready" && status.kind !== "ios_install") return;
      if (supported) {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js").catch(() => undefined);
        if (await reg?.pushManager.getSubscription().catch(() => null)) return;
      }
      if (alive) setShow(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // En la propia pantalla de avisos el recordatorio sobra: los ajustes ya están ahí.
  if (!show || (href.startsWith("/") && pathname.startsWith(href.split("#")[0]!))) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      // Se oculta igual en esta visita.
    }
    setShow(false);
  };

  return (
    <aside role="region" aria-label="Avisos en tu dispositivo" className={cn("flex items-start gap-3 rounded-card bg-accent-soft p-4", className)}>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-accent" aria-hidden>
        <BellRing className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">¿Querés enterarte sin tener que entrar?</p>
        <p className="mt-0.5 text-sm text-text-muted">Activá los avisos y te llegan a tu pantalla cuando pasa algo que te importa. Podés cambiarlo o apagarlo cuando quieras.</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Link href={href} onClick={dismiss} className="inline-flex min-h-11 items-center rounded-pill bg-accent px-4 text-sm font-semibold text-accent-contrast transition-transform active:scale-[0.97]">
            Ver cómo activarlos
          </Link>
          <button type="button" onClick={dismiss} className="inline-flex min-h-11 items-center rounded-pill px-4 text-sm font-medium text-text-muted transition-colors hover:text-text">
            Ahora no
          </button>
        </div>
      </div>
      <button type="button" onClick={dismiss} aria-label="Cerrar" className="relative -mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-full text-text-muted hover:text-text after:absolute after:-inset-2 after:content-['']">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </aside>
  );
}
