"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/utils/cn";
import { useSnapCarousel } from "./useSnapCarousel";

type GalleryImage = { url: string; alt: string };

/** Carril horizontal con `scroll-snap`: se desliza con el dedo (o el trackpad) y cada foto queda centrada. */
const TRACK = "flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
const SLIDE = "relative h-full w-full shrink-0 snap-center snap-always";

const MAX_DOTS = 7;

export function Gallery({ images, title }: { images: GalleryImage[]; title: string }) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const { ref: trackRef, onScroll, goTo } = useSnapCarousel({ count: images.length, index: active, onIndexChange: setActive });
  const thumbs = useRef<HTMLDivElement>(null);

  // La miniatura activa acompaña al deslizamiento: se centra dentro de su fila (sin mover la página).
  useEffect(() => {
    const strip = thumbs.current;
    const thumb = strip?.children[active] as HTMLElement | undefined;
    if (!strip || !thumb) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    strip.scrollTo({ left: thumb.offsetLeft - (strip.clientWidth - thumb.clientWidth) / 2, behavior: reduced ? "auto" : "smooth" });
  }, [active]);

  if (images.length === 0) {
    return (
      <div className="flex aspect-[16/10] w-full items-center justify-center rounded-card bg-surface-2 text-text-muted">
        Sin fotos todavía
      </div>
    );
  }

  const many = images.length > 1;

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === "ArrowRight") goTo(active + 1);
    else if (e.key === "ArrowLeft") goTo(active - 1);
    else return;
    e.preventDefault();
  }

  return (
    <div>
      <div className="group/carousel relative">
        <div
          ref={trackRef}
          onScroll={onScroll}
          onKeyDown={onKeyDown}
          role="region"
          aria-roledescription="carrusel"
          aria-label={`Fotos de ${title}`}
          className={cn(TRACK, "aspect-[16/10] w-full rounded-card bg-surface-2")}
        >
          {images.map((img, i) => (
            <div key={img.url + i} role="group" aria-roledescription="diapositiva" aria-label={`Foto ${i + 1} de ${images.length}`} className={SLIDE}>
              <button
                type="button"
                onClick={() => setLightbox(true)}
                tabIndex={i === active ? 0 : -1}
                aria-label="Ver foto en pantalla completa"
                className="absolute inset-0 block cursor-zoom-in"
              >
                <Image src={img.url} alt={img.alt} fill priority={i === 0} sizes="(min-width: 1024px) 800px, 100vw" className="object-cover" />
              </button>
            </div>
          ))}
        </div>

        {many && (
          <>
            {images.length <= MAX_DOTS && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5" aria-hidden>
                {images.map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1.5 rounded-full bg-white/60 shadow-[0_0_0_1px_rgb(0_0_0/0.12)] transition-[width,background-color] duration-200 [transition-timing-function:var(--ease-out)]",
                      i === active ? "w-4 bg-white" : "w-1.5"
                    )}
                  />
                ))}
              </div>
            )}
            <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium tabular-nums text-white" aria-hidden>
              {active + 1} / {images.length}
            </span>
            {/* Con mouse: flechas al pasar por encima. En el celular se desliza con el dedo. */}
            <CarouselArrow direction="prev" disabled={active === 0} onClick={() => goTo(active - 1)} />
            <CarouselArrow direction="next" disabled={active === images.length - 1} onClick={() => goTo(active + 1)} />
          </>
        )}
      </div>

      {many && (
        <div ref={thumbs} className="relative mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((img, i) => (
            <button
              key={img.url + i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Foto ${i + 1} de ${images.length}`}
              aria-current={i === active}
              className={cn(
                "relative h-16 w-20 shrink-0 overflow-hidden rounded-media",
                "transition-[outline-color,opacity] duration-150",
                i === active ? "outline outline-2 outline-accent" : "opacity-70 hover:opacity-100"
              )}
            >
              <Image src={img.url} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      )}

      {lightbox && <Lightbox images={images} index={active} onIndexChange={setActive} onClose={() => setLightbox(false)} />}
    </div>
  );
}

function CarouselArrow({ direction, disabled, onClick }: { direction: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      tabIndex={-1}
      aria-label={direction === "prev" ? "Foto anterior" : "Foto siguiente"}
      className={cn(
        "absolute top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white",
        "opacity-0 transition-[opacity,transform,background-color] duration-150 [transition-timing-function:var(--ease-out)] active:scale-95",
        "[@media(hover:hover)]:flex [@media(hover:hover)]:group-hover/carousel:opacity-100 hover:bg-black/70 disabled:pointer-events-none disabled:!opacity-0",
        direction === "prev" ? "left-3" : "right-3"
      )}
    >
      <Icon className="h-5 w-5" aria-hidden />
    </button>
  );
}

function Lightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: GalleryImage[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const { ref: trackRef, onScroll, goTo } = useSnapCarousel({ count: images.length, index, onIndexChange });

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goTo(index + 1);
      if (e.key === "ArrowLeft") goTo(index - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [index, onClose, goTo]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/90 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Galería de fotos"
    >
      <div className="flex justify-end p-4">
        <IconButton variant="ghost" aria-label="Cerrar" className="text-white hover:bg-white/10" onClick={onClose}>
          <X className="h-5 w-5" aria-hidden />
        </IconButton>
      </div>

      <div className="relative min-h-0 flex-1 pb-4">
        <div ref={trackRef} onScroll={onScroll} className={cn(TRACK, "absolute inset-x-0 bottom-4 top-0")}>
          {images.map((img, i) => (
            <div key={img.url + i} className={SLIDE}>
              <Image src={img.url} alt={img.alt} fill priority={i === index} sizes="100vw" className="object-contain" />
            </div>
          ))}
        </div>

        {images.length > 1 && (
          <>
            <NavButton direction="prev" disabled={index === 0} onClick={() => goTo(index - 1)} />
            <NavButton direction="next" disabled={index === images.length - 1} onClick={() => goTo(index + 1)} />
          </>
        )}
      </div>

      {images.length > 1 && (
        <p className="pb-4 text-center text-sm text-white/70">
          {index + 1} / {images.length}
        </p>
      )}
    </div>,
    document.body
  );
}

function NavButton({ direction, disabled, onClick }: { direction: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "prev" ? "Foto anterior" : "Foto siguiente"}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20",
        "transition-[transform,background-color,opacity] duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-30",
        direction === "prev" ? "left-2 sm:left-6" : "right-2 sm:right-6"
      )}
    >
      {direction === "prev" ? (
        <ChevronLeft className="h-5 w-5" aria-hidden />
      ) : (
        <ChevronRight className="h-5 w-5" aria-hidden />
      )}
    </button>
  );
}
