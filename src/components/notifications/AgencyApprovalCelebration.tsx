"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/Button";

export type Celebration = { id: string; title: string; body: string; href: string };

/**
 * Cartel de felicitación cuando el admin aprueba la solicitud de inmobiliaria.
 * Se muestra UNA sola vez: apenas aparece, la notificación se marca como
 * leída (así el servidor no la vuelve a ofrecer, aunque se recargue la
 * página) y se refresca la sesión para que el menú ya muestre las opciones
 * de gestión sin tener que volver a ingresar.
 */
export function AgencyApprovalCelebration({
  celebration,
  onClose,
}: {
  celebration: Celebration;
  onClose: () => void;
}) {
  const router = useRouter();
  const { update } = useSession();
  const scope = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [celebration.id] }),
    }).catch(() => {});
    update().catch(() => {});
    // Una vez por cartel: `update` cambia de identidad en cada render de la sesión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebration.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.fromTo("[data-celebration-overlay]", { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "power2.out" });
      gsap.fromTo(
        "[data-celebration-card]",
        { opacity: 0, y: 16, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "expo.out", delay: 0.05 }
      );
      gsap.fromTo(
        "[data-celebration-icon]",
        { scale: 0, rotation: -25 },
        { scale: 1, rotation: 0, duration: 0.6, ease: "back.out(2)", delay: 0.2 }
      );
    },
    { scope }
  );

  function go() {
    onClose();
    router.push(celebration.href);
  }

  return createPortal(
    <div ref={scope} className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div data-celebration-overlay="" className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div
        data-celebration-card=""
        role="dialog"
        aria-modal="true"
        aria-labelledby="celebration-title"
        className="relative w-full max-w-sm rounded-card bg-surface p-7 text-center shadow-float"
      >
        <div
          data-celebration-icon=""
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent"
        >
          <PartyPopper className="h-8 w-8" aria-hidden />
        </div>
        <h2 id="celebration-title" className="mt-5 font-display text-xl font-bold text-text">
          {celebration.title}
        </h2>
        {celebration.body && <p className="mt-2 text-sm text-text-muted">{celebration.body}</p>}
        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={go} autoFocus>
            {celebration.href === "/publicar" ? "Crear mi inmobiliaria" : "Ir a mi panel"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Ahora no
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
