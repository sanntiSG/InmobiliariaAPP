"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/utils/cn";

export function Gallery({ images, title }: { images: { url: string; alt: string }[]; title: string }) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  if (images.length === 0) {
    return (
      <div className="flex aspect-[16/10] w-full items-center justify-center rounded-card bg-surface-2 text-text-muted">
        Sin fotos todavía
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setLightbox(true)}
        className="relative block aspect-[16/10] w-full overflow-hidden rounded-card bg-surface-2"
        aria-label="Ver foto en pantalla completa"
      >
        <Image
          src={images[active].url}
          alt={images[active].alt}
          fill
          priority
          sizes="(min-width: 1024px) 800px, 100vw"
          className="object-cover"
        />
      </button>

      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((img, i) => (
            <button
              key={img.url + i}
              onClick={() => setActive(i)}
              aria-label={`Foto ${i + 1} de ${images.length}`}
              aria-current={i === active}
              className={cn(
                "relative h-16 w-20 shrink-0 overflow-hidden rounded-media",
                "transition-[outline-color] duration-150",
                i === active ? "outline outline-2 outline-accent" : "opacity-70 hover:opacity-100"
              )}
            >
              <Image src={img.url} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <Lightbox images={images} title={title} index={active} onIndexChange={setActive} onClose={() => setLightbox(false)} />
      )}
    </div>
  );
}

function Lightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: { url: string; alt: string }[];
  title: string;
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndexChange((index + 1) % images.length);
      if (e.key === "ArrowLeft") onIndexChange((index - 1 + images.length) % images.length);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [index, images.length, onClose, onIndexChange]);

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

      <div className="relative flex-1 px-4 pb-4">
        <Image
          src={images[index].url}
          alt={images[index].alt}
          fill
          sizes="100vw"
          className="object-contain"
          priority
        />

        {images.length > 1 && (
          <>
            <NavButton direction="prev" onClick={() => onIndexChange((index - 1 + images.length) % images.length)} />
            <NavButton direction="next" onClick={() => onIndexChange((index + 1) % images.length)} />
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

function NavButton({ direction, onClick }: { direction: "prev" | "next"; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={direction === "prev" ? "Foto anterior" : "Foto siguiente"}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20",
        "transition-[transform,background-color] duration-150 active:scale-95",
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
