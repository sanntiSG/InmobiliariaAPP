"use client";

import { memo, useState } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { PriceTag } from "./PriceTag";
import { PropertyFeatures } from "./PropertyFeatures";
import { TourBadge } from "./TourBadge";
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
  className,
}: {
  property: PropertyCardData;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onHoverChange?: (id: string | null) => void;
  priority?: boolean;
  className?: string;
}) {
  // Favoritos requiere sesión (ver CLAUDE.md: modo "solo explorar" no persiste
  // interacciones). Placeholder visual optimista hasta que exista auth (sesión 4).
  const [favorited, setFavorited] = useState(false);

  return (
    <article
      className={cn(
        "group bg-surface rounded-card shadow-card overflow-hidden cursor-pointer",
        "transition-[transform,box-shadow] duration-200 [transition-timing-function:var(--ease-out)]",
        "hover:-translate-y-0.5 hover:shadow-float",
        selected && "ring-2 ring-accent",
        className
      )}
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
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-card bg-surface-2">
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
          className="absolute right-3 top-3"
          onClick={(e) => {
            e.stopPropagation();
            setFavorited((v) => !v);
          }}
        >
          <HeartIcon filled={favorited} />
        </IconButton>

        {property.tour3d && <TourBadge className="absolute bottom-3 left-3" />}
      </div>

      <div className="flex flex-col gap-2 p-4">
        <PriceTag amount={property.price} currency={property.currency} period={property.period} />
        <p className="truncate text-sm text-text-muted">
          {[property.neighborhood, property.city].filter(Boolean).join(", ")}
        </p>
        <PropertyFeatures bedrooms={property.bedrooms} bathrooms={property.bathrooms} area={property.area} />
      </div>
    </article>
  );
}

// Las cards se re-renderizan en cada hover sobre CUALQUIER pin/card del mapa
// (ver ResultsPanel/MapCanvas) — memo evita recalcular las ~50 que no cambiaron.
export const PropertyCard = memo(PropertyCardImpl);

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-[18px] w-[18px] transition-[transform,color] duration-150 [transition-timing-function:var(--ease-out)]", filled ? "text-danger scale-110" : "text-text")}
      fill={filled ? "currentColor" : "none"}
      aria-hidden
    >
      <path
        d="M12 20s-7-4.35-9.5-8.5C.5 8 2 4.5 5.5 4c2-.3 3.5.8 4.5 2.2C11 4.8 12.5 3.7 14.5 4 18 4.5 19.5 8 21.5 11.5 19 15.65 12 20 12 20Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
