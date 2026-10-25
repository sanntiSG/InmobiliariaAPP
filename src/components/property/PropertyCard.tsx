"use client";

import { memo, useState, type CSSProperties } from "react";
import Image from "next/image";
import { Heart, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { PriceTag } from "./PriceTag";
import { PropertyFeatures } from "./PropertyFeatures";
import { TourBadge } from "./TourBadge";
import { AmbientBadge } from "./AmbientBadge";
import { OPERATION_LABELS } from "@/config/filters";
import { cn } from "@/lib/utils/cn";
import type { PropertyCardData } from "./types";

function PropertyCardImpl({
  property,
  selected = false,
  onSelect,
  onHoverChange,
  /** true para las primeras cards visibles (above the fold) — evita competir por ancho de banda con el resto. */
  priority = false,
  revealIndex,
  className,
}: {
  property: PropertyCardData;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onHoverChange?: (id: string | null) => void;
  priority?: boolean;
  /** Posición dentro de su lote: la card entra con un `rise` escalonado. Sin esto no anima (el mapa no lo usa). */
  revealIndex?: number;
  className?: string;
}) {
  // Favoritos requiere sesión (ver CLAUDE.md: modo "solo explorar" no persiste
  // interacciones). Placeholder visual optimista hasta que exista auth (sesión 4).
  const [favorited, setFavorited] = useState(false);

  return (
    <article
      className={cn(
        // El contenedor no recorta (la sombra del hover vive en su ::after, ver .lift); el recorte va en el hijo.
        "lift group rounded-card cursor-pointer",
        revealIndex != null && "rise",
        selected && "ring-2 ring-accent",
        className
      )}
      style={revealIndex != null ? ({ "--rise-i": revealIndex } as CSSProperties) : undefined}
      onClick={() => onSelect?.(property.id)}
      onMouseEnter={() => onHoverChange?.(property.id)}
      onMouseLeave={() => onHoverChange?.(null)}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(property.id);
        }
      }}
    >
      <div className="overflow-hidden rounded-card bg-surface shadow-card">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-2">
        {property.image ? (
          <Image
            src={property.image}
            alt={property.title}
            fill
            sizes="(min-width: 1024px) 320px, 90vw"
            priority={priority}
            loading={priority ? undefined : "lazy"}
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-text-muted text-sm">Sin foto</div>
        )}

        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {property.isNew && <Badge variant="success">Nuevo</Badge>}
          <Badge variant="overlay">{OPERATION_LABELS[property.operation as keyof typeof OPERATION_LABELS] ?? property.operation}</Badge>
        </div>

        <IconButton
          size={34}
          aria-label={favorited ? "Quitar de favoritos" : "Guardar en favoritos"}
          className="absolute right-3 top-3 after:absolute after:-inset-1.5 after:content-['']"
          onClick={(e) => {
            e.stopPropagation();
            setFavorited((v) => !v);
          }}
        >
          <Heart
            className={cn(
              "h-[18px] w-[18px] transition-[transform,color] duration-150 [transition-timing-function:var(--ease-out)]",
              favorited ? "text-danger scale-110" : "text-text"
            )}
            fill={favorited ? "currentColor" : "none"}
            aria-hidden
          />
        </IconButton>

        {(property.tour3d || property.ambient) && (
          <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
            {property.tour3d && <TourBadge />}
            {property.ambient && <AmbientBadge />}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 p-4">
        <PriceTag amount={property.price} currency={property.currency} period={property.period} />
        <p className="truncate text-sm text-text-muted">
          {[property.neighborhood, property.city].filter(Boolean).join(", ")}
        </p>
        <PropertyFeatures bedrooms={property.bedrooms} bathrooms={property.bathrooms} area={property.area} />
        {property.reason && (
          <p className="mt-1 flex items-start gap-1.5 border-t border-border pt-2.5 text-xs text-text-muted">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
            {property.reason}
          </p>
        )}
      </div>
      </div>
    </article>
  );
}

// Las cards se re-renderizan en cada hover sobre CUALQUIER pin/card del mapa
// (ver ResultsPanel/MapCanvas) — memo evita recalcular las ~50 que no cambiaron.
export const PropertyCard = memo(PropertyCardImpl);
