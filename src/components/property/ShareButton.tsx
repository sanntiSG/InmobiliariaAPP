"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { buildWhatsappLink } from "@/config/site";
import { track } from "@/lib/tracking/client";

/**
 * Compartir la propiedad. En celulares abre la hoja nativa (`navigator.share`);
 * donde no existe (la mayoría de los desktop) ofrece copiar el link o mandarlo
 * por WhatsApp. Cada compartida se registra como evento `share`.
 */
export function ShareButton({ propertyId, title }: { propertyId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function share() {
    const url = window.location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        track({ propertyId, event: "share", method: "native" });
      } catch {
        // la persona cerró la hoja de compartir: no es un error ni una compartida
      }
      return;
    }
    setOpen((v) => !v);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      track({ propertyId, event: "share", method: "copy" });
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setOpen(false);
      }, 1400);
    } catch {
      setOpen(false);
    }
  }

  const whatsappHref = typeof window === "undefined" ? "#" : buildWhatsappLink(`${title} — ${window.location.href}`);

  return (
    <div ref={wrapperRef} className="relative">
      <Button variant="secondary" size="sm" onClick={share} aria-haspopup="menu" aria-expanded={open}>
        <Share2 className="h-4 w-4" aria-hidden />
        Compartir
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-2 flex w-52 flex-col gap-1 rounded-card border border-border bg-surface p-2 shadow-pop"
        >
          <button
            type="button"
            role="menuitem"
            onClick={copy}
            className={buttonClasses("ghost", "sm", "justify-start")}
          >
            {copied ? <Check className="h-4 w-4 text-success" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
            {copied ? "¡Link copiado!" : "Copiar link"}
          </button>
          <a
            role="menuitem"
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              track({ propertyId, event: "share", method: "whatsapp" });
              setOpen(false);
            }}
            className={buttonClasses("ghost", "sm", "justify-start")}
          >
            Enviar por WhatsApp
          </a>
        </div>
      )}
    </div>
  );
}
