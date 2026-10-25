"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils/cn";
import type { TemplateLayout, TemplateMeta } from "@/lib/social/template-meta";

/** Una "foto" de la propiedad (la real, recortada) para que cada miniatura se vea como quedaría. */
function Photo({ photo, className, style }: { photo: string | null; className?: string; style?: CSSProperties }) {
  return (
    <span
      className={cn("block bg-[color-mix(in_oklab,var(--text)_16%,var(--surface))] bg-cover bg-center", className)}
      style={{ ...(photo ? { backgroundImage: `url("${photo}")` } : null), ...style }}
    />
  );
}

const line = "block rounded-full";

/** El dibujo esquemático de cada diseño (4:5). Son bloques de CSS, no una imagen pedida al servidor. */
function Drawing({ layout, photo }: { layout: TemplateLayout; photo: string | null }) {
  switch (layout) {
    case "full":
      return (
        <span className="relative block h-full w-full overflow-hidden bg-[#10131a]">
          <Photo photo={photo} className="absolute inset-0" />
          <span className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/85 to-transparent" />
          <span className="absolute inset-x-[10%] bottom-[9%] flex flex-col gap-[5%]">
            <span className={cn(line, "h-[5px] w-3/5 bg-white/85")} />
            <span className={cn(line, "h-[9px] w-4/5 bg-white")} />
          </span>
        </span>
      );
    case "split":
      return (
        <span className="flex h-full w-full flex-col overflow-hidden bg-white">
          <Photo photo={photo} className="h-[62%] w-full" />
          <span className="flex flex-1 flex-col justify-center gap-1.5 px-[10%]">
            <span className={cn(line, "h-[5px] w-3/5 bg-[#10131a]/70")} />
            <span className={cn(line, "h-[9px] w-2/5 bg-accent")} />
          </span>
        </span>
      );
    case "frame":
      return (
        <span className="flex h-full w-full flex-col gap-[7%] overflow-hidden bg-[#f3efe7] p-[7%]">
          <Photo photo={photo} className="h-[64%] w-full rounded-[10%]" />
          <span className="flex flex-col gap-1.5">
            <span className={cn(line, "h-[5px] w-3/5 bg-[#10131a]/70")} />
            <span className={cn(line, "h-[8px] w-1/2 bg-[#10131a]")} />
          </span>
        </span>
      );
    case "column":
      return (
        <span className="flex h-full w-full overflow-hidden bg-accent">
          <span className="flex w-[44%] flex-col justify-end gap-1.5 px-[7%] pb-[10%]">
            <span className={cn(line, "h-[5px] w-4/5 bg-accent-contrast/80")} />
            <span className={cn(line, "h-[9px] w-full bg-accent-contrast")} />
          </span>
          <Photo photo={photo} className="h-full flex-1" />
        </span>
      );
    case "card":
      return (
        <span className="relative block h-full w-full overflow-hidden bg-[#10131a]">
          <Photo photo={photo} className="absolute inset-0" />
          <span className="absolute inset-x-[8%] bottom-[8%] flex flex-col gap-1.5 rounded-[12%] bg-white px-[8%] py-[7%] shadow-md">
            <span className={cn(line, "h-[5px] w-3/5 bg-[#10131a]/70")} />
            <span className={cn(line, "h-[8px] w-2/5 bg-accent")} />
          </span>
        </span>
      );
    case "dark":
      return (
        <span className="flex h-full w-full flex-col gap-[6%] overflow-hidden bg-[#0b0d12] p-[8%]">
          <Photo photo={photo} className="h-[58%] w-full rounded-[8%]" />
          <span className="flex flex-col gap-1.5">
            <span className={cn(line, "h-[5px] w-3/5 bg-white/70")} />
            <span className={cn(line, "h-[9px] w-3/4 bg-white")} />
          </span>
        </span>
      );
  }
}

/** Miniatura elegible de un diseño (con su nombre abajo). Es un botón de opción: `aria-pressed` marca el elegido. */
export function TemplateThumb({
  meta,
  photo,
  selected,
  current,
  disabled,
  onSelect,
}: {
  meta: TemplateMeta;
  photo: string | null;
  selected: boolean;
  /** Es el que tiene hoy la publicación. */
  current?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      title={meta.hint}
      className={cn(
        "group flex flex-col gap-2 rounded-card p-2 text-left transition-[transform,background-color,box-shadow] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.97]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        selected ? "bg-accent-soft ring-2 ring-accent" : "bg-surface-2 hover:bg-surface-sunken",
        disabled && "pointer-events-none opacity-55"
      )}
    >
      <span className="block aspect-[4/5] w-full overflow-hidden rounded-media shadow-pop">
        <Drawing layout={meta.layout} photo={photo} />
      </span>
      <span className="flex items-baseline justify-between gap-2 px-0.5">
        <span className="text-sm font-semibold text-text">{meta.name}</span>
        {current && <span className="text-[11px] font-medium text-text-muted">Actual</span>}
      </span>
    </button>
  );
}
