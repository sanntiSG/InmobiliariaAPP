"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { X, Heart } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { Badge } from "@/components/ui/Badge";
import { PriceTag } from "@/components/property/PriceTag";
import { PropertyFeatures } from "@/components/property/PropertyFeatures";
import { TourBadge } from "@/components/property/TourBadge";
import { AmbientBadge } from "@/components/property/AmbientBadge";
import { AvailabilityBadge } from "@/components/property/AvailabilityBadge";
import { AgencyAvatar } from "@/components/property/AgencyAvatar";
import { OPERATION_LABELS } from "@/config/filters";
import { beachDistanceLabel } from "@/config/pricing";
import { cn } from "@/lib/utils/cn";
import type { PropertyCardData } from "@/components/property/types";

/**
 * Card flotante sobre el pin seleccionado, con "pico" propio (el tip nativo
 * de MapLibre queda deshabilitado en globals.css) y entrada animada con
 * origen en el pico — ver .impeccable.md y emil-design-eng.
 *
 * Responsive: desde `sm` es la card vertical de 272 px (foto arriba, datos abajo). En una pantalla
 * chica pasa a formato horizontal compacto (foto de 112 px a la izquierda, datos a la derecha, ~150 px
 * de alto en vez de ~390) y su ancho nunca supera el de la pantalla menos 24 px, para no tapar el mapa.
 */
export function PropertyPopupCard({
  property,
  onClose,
}: {
  property: PropertyCardData;
  onClose: () => void;
}) {
  const [favorited, setFavorited] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion || !cardRef.current) return;
      gsap.fromTo(
        cardRef.current,
        { opacity: 0, y: 8, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.22, ease: "expo.out" }
      );
    },
    { scope: cardRef }
  );

  return (
    <div className="relative w-[min(332px,calc(100vw-24px))] sm:w-[272px]">
      <div
        ref={cardRef}
        className="relative overflow-visible rounded-card bg-surface shadow-float max-sm:flex"
        style={{ transformOrigin: "50% 100%" }}
      >
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-t-card bg-surface-2 max-sm:aspect-auto max-sm:min-h-[148px] max-sm:w-[112px] max-sm:shrink-0 max-sm:rounded-l-card max-sm:rounded-tr-none">
          {property.image ? (
            <Image
              src={property.image}
              alt={property.title}
              fill
              sizes="(max-width: 639px) 112px, 272px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">Sin foto</div>
          )}

          <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
            <Badge variant="overlay">
              {OPERATION_LABELS[property.operation as keyof typeof OPERATION_LABELS] ?? property.operation}
            </Badge>
          </div>

          {(property.tour3d || property.ambient) && (
            <div className="absolute bottom-2.5 left-2.5 flex gap-1.5">
              {property.tour3d && <TourBadge compact />}
              {property.ambient && <AmbientBadge compact />}
            </div>
          )}

          <IconButton
            size={30}
            aria-label={favorited ? "Quitar de favoritos" : "Guardar en favoritos"}
            className="absolute bottom-2.5 right-2.5"
            onClick={() => setFavorited((v) => !v)}
          >
            <Heart
              className={cn("h-4 w-4 transition-[transform,color] duration-150 [transition-timing-function:var(--ease-out)]", favorited ? "text-danger scale-110" : "text-text")}
              fill={favorited ? "currentColor" : "none"}
              aria-hidden
            />
          </IconButton>
        </div>

        <IconButton size={30} aria-label="Cerrar" className="absolute right-2.5 top-2.5" onClick={onClose}>
          <X className="h-3.5 w-3.5" aria-hidden />
        </IconButton>

        <div className="flex min-w-0 flex-col gap-1.5 p-3.5 max-sm:flex-1 max-sm:gap-1 max-sm:p-3">
          <PriceTag amount={property.price} currency={property.currency} period={property.period} className="text-lg max-sm:pr-8" />
          <p className="truncate text-sm text-text-muted">{property.title}</p>
          <p className="truncate text-xs text-text-muted">
            {[property.neighborhood, property.city].filter(Boolean).join(", ")}
          </p>
          <PropertyFeatures
            bedrooms={property.bedrooms}
            bathrooms={property.bathrooms}
            area={property.area}
            className="mt-1 flex flex-wrap items-center gap-1.5"
          />
          {property.beachDistance != null && <p className="truncate text-xs text-text-muted">{beachDistanceLabel(property.beachDistance)}</p>}
          {property.rental && <AvailabilityBadge rental={property.rental} />}
          {property.agencyName && (
            // <a> plano por la misma razón que el link de abajo (fuera del árbol de React de la app).
            <a
              href={property.agencySlug ? `/inmobiliarias/${property.agencySlug}` : undefined}
              className="mt-1 flex items-center gap-2 text-[11px] font-medium text-text-muted hover:text-accent max-sm:hidden"
            >
              <AgencyAvatar name={property.agencyName} logo={property.agencyLogo} size={22} />
              <span className="truncate">{property.agencyName}</span>
            </a>
          )}
          {/*
            <a> plano a propósito, no next/link: este componente se monta con
            ReactDOM.createRoot() sobre un div suelto que le pasamos a
            maplibregl.Popup.setDOMContent() (ver MapCanvas.tsx) — vive fuera
            del árbol de React de la app, sin el contexto del router de Next.
            useRouter()/Link fallarían sin ese Provider; un <a> normal navega
            con una carga de página completa, que acá es lo correcto.
          */}
          <a
            href={`/propiedades/${property.slug}`}
            className="mt-2 inline-flex items-center justify-center whitespace-nowrap rounded-pill bg-accent px-3 py-2 text-center text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover max-sm:mt-auto max-sm:py-1.5 max-sm:text-xs"
          >
            <span>
              Ver propiedad<span className="max-sm:hidden"> completa</span>
            </span>
          </a>
        </div>

        {/* Pico: cuadrado rotado, mismo color que la card, apuntando al pin.
            Vive dentro de cardRef para animar como una sola pieza con el resto. */}
        <div
          className="absolute left-1/2 bottom-0 h-3.5 w-3.5 -translate-x-1/2 translate-y-1/2 rotate-45 rounded-[2px] bg-surface"
          aria-hidden
        />
      </div>
    </div>
  );
}
