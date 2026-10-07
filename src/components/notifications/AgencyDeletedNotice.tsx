"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { MessageCircle, Store } from "lucide-react";
import { buttonClasses, Button } from "@/components/ui/Button";
import { providerDeletedMessage, whatsappUrl } from "@/lib/whatsapp/messages";

export type DeletionNotice = { id: string; agencyName: string };

/**
 * Aviso para quien vuelve a entrar después de que el admin eliminó su
 * inmobiliaria. Se muestra UNA sola vez (al aparecer se marca visto en el
 * servidor). Es informativo: "Cerrar" lo descarta y "Contactar con el admin"
 * abre WhatsApp con el mensaje armado.
 */
export function AgencyDeletedNotice({ notice, onClose }: { notice: DeletionNotice; onClose: () => void }) {
  const scope = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deletionNoticeId: notice.id }),
    }).catch(() => {});
  }, [notice.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.fromTo("[data-notice-overlay]", { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power2.out" });
      gsap.fromTo(
        "[data-notice-card]",
        { opacity: 0, y: 12, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: "expo.out", delay: 0.04 }
      );
    },
    { scope }
  );

  return createPortal(
    <div ref={scope} className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div data-notice-overlay="" className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div
        data-notice-card=""
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="deleted-notice-title"
        className="relative w-full max-w-sm rounded-card bg-surface p-6 shadow-float"
      >
        <div className="flex size-10 items-center justify-center rounded-full bg-danger-soft text-danger">
          <Store className="h-5 w-5" aria-hidden />
        </div>
        <h2 id="deleted-notice-title" className="mt-4 font-display text-lg font-semibold text-text">
          Se eliminó tu inmobiliaria «{notice.agencyName}»
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          Se borró todo lo que habías cargado (propiedades, fotos, clientes) y perdiste el permiso para gestionarla. Si
          querés volver a tener una, tenés que pedir permiso de nuevo.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} autoFocus>
            Cerrar
          </Button>
          <a
            href={whatsappUrl(providerDeletedMessage(notice.agencyName))}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses("secondary", "sm")}
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            Contactar con el admin
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
}
