"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import { Check, Copy, Mail, MapPin, MessageCircle, Send, Share2 } from "lucide-react";
import { AgencyAvatar } from "@/components/property/AgencyAvatar";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { brand } from "@/config/brand";
import { buildWhatsappShareLink } from "@/config/site";
import { cn } from "@/lib/utils/cn";

type Props = {
  name: string;
  slug: string;
  logo?: string | null;
  cover?: string | null;
  place?: string;
};

/** Cada opción de compartir es un enlace común (abre la app o la pestaña que corresponda), así funciona en cualquier navegador. */
const tile =
  "pop-in group flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-media border border-border bg-surface-2 px-2 py-3 text-xs font-semibold text-text " +
  "transition-[transform,background-color,border-color] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.97] " +
  "[@media(hover:hover)_and_(pointer:fine)]:hover:border-border-hi [@media(hover:hover)_and_(pointer:fine)]:hover:bg-surface-3";

const tileIcon = "grid size-9 place-items-center rounded-full bg-accent-soft text-accent";

/**
 * Compartir el perfil de una inmobiliaria. Abre una hoja (desde abajo en el celular, tarjeta centrada en pantallas grandes) con
 * una vista previa de lo que se va a mandar —portada, logo, nombre y dirección—, el enlace para copiar y los destinos más
 * comunes: WhatsApp, Telegram, correo y, donde el navegador lo ofrece, el menú nativo de compartir del teléfono.
 * Al pegar el enlace en un chat se ve una tarjeta con la portada y el nombre (ver `opengraph-image.tsx`).
 */
export function ShareAgencyButton({ name, slug, logo, cover, place }: Props) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [canNative, setCanNative] = useState(false);
  const [copied, setCopied] = useState(false);
  const linkText = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), []);

  const show = () => {
    // La dirección se arma al abrir (en el cliente): así es la de verdad, con el dominio por el que se está mirando.
    setUrl(new URL(`/inmobiliarias/${slug}`, window.location.origin).toString());
    setCanNative(typeof navigator.share === "function");
    setCopied(false);
    setOpen(true);
  };

  const text = `${name} en ${brand.name}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Sin permiso para el portapapeles: se selecciona el enlace para que se copie a mano.
      if (linkText.current) window.getSelection()?.selectAllChildren(linkText.current);
    }
    setCopied(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1800);
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title: name, text, url });
      setOpen(false);
    } catch {
      // La persona cerró el menú del teléfono: no es un error.
    }
  };

  const enc = encodeURIComponent;
  const shareLinks = [
    { key: "wa", label: "WhatsApp", href: buildWhatsappShareLink(`${text}\n${url}`), icon: <MessageCircle className="h-[18px] w-[18px]" aria-hidden /> },
    { key: "tg", label: "Telegram", href: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`, icon: <Send className="h-[18px] w-[18px]" aria-hidden /> },
    { key: "mail", label: "Email", href: `mailto:?subject=${enc(text)}&body=${enc(`${text}\n${url}`)}`, icon: <Mail className="h-[18px] w-[18px]" aria-hidden /> },
  ];

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={show} aria-haspopup="dialog">
        <Share2 className="h-4 w-4" aria-hidden /> Compartir
      </Button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Compartir este perfil" side="bottom" centered>
        <div className="flex flex-col gap-4 pt-1">
          {/* Vista previa de lo que se comparte */}
          <div className="overflow-hidden rounded-media border border-border bg-surface-2">
            <div className="relative h-24 bg-accent-soft sm:h-28">
              {cover && <Image src={cover} alt="" fill sizes="(min-width: 640px) 448px, 100vw" className="object-cover" />}
            </div>
            <div className="flex items-center gap-3 px-4 pb-4">
              <AgencyAvatar name={name} logo={logo} size={52} className="-mt-7 ring-4 ring-surface-2" />
              <div className="min-w-0 pt-2">
                <p className="truncate font-display text-base font-semibold text-text">{name}</p>
                {place && (
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-text-muted">
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden /> {place}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Enlace */}
          <div className="flex items-center gap-2 rounded-media border border-border bg-surface-sunken py-1.5 pl-3.5 pr-1.5">
            {/* El enlace completo, en hasta dos líneas (en un campo de texto se cortaba y no se podía leer entero). */}
            <span ref={linkText} aria-label="Enlace del perfil" className="line-clamp-2 min-w-0 flex-1 select-all break-all font-mono text-xs leading-snug text-text-muted">
              {url}
            </span>
            <button
              type="button"
              onClick={() => void copy()}
              aria-live="polite"
              className={cn(
                "relative inline-flex h-10 min-w-[7.5rem] shrink-0 items-center justify-center gap-1.5 rounded-pill px-3.5 text-sm font-semibold",
                "transition-[transform,background-color,color] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.97]",
                copied ? "bg-success-soft text-success" : "bg-accent text-accent-contrast"
              )}
            >
              <span className="relative grid size-4 place-items-center">
                <Copy className={cn("absolute h-4 w-4 transition-[opacity,transform] duration-150", copied ? "scale-90 opacity-0" : "scale-100 opacity-100")} aria-hidden />
                <Check className={cn("absolute h-4 w-4 transition-[opacity,transform] duration-150", copied ? "scale-100 opacity-100" : "scale-90 opacity-0")} aria-hidden />
              </span>
              {copied ? "¡Copiado!" : "Copiar link"}
            </button>
          </div>

          {/* Destinos */}
          <div className={cn("grid gap-2", canNative ? "grid-cols-4" : "grid-cols-3")}>
            {shareLinks.map((l, i) => (
              <a key={l.key} href={l.href} target={l.key === "mail" ? undefined : "_blank"} rel="noopener noreferrer" onClick={() => setOpen(false)} className={tile} style={{ "--rise-i": i } as CSSProperties}>
                <span className={tileIcon}>{l.icon}</span>
                {l.label}
              </a>
            ))}
            {canNative && (
              <button type="button" onClick={() => void nativeShare()} className={tile} style={{ "--rise-i": shareLinks.length } as CSSProperties}>
                <span className={tileIcon}>
                  <Share2 className="h-[18px] w-[18px]" aria-hidden />
                </span>
                Más
              </button>
            )}
          </div>
        </div>
      </Sheet>
    </>
  );
}
