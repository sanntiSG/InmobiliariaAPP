"use client";

import { useRouter } from "next/navigation";
import { PropertyCard } from "./PropertyCard";
import type { PropertyCardData } from "./types";

/**
 * PropertyCard tiene un <button> interno (favorito) — envolverlo en <a>
 * sería HTML inválido (interactivo dentro de interactivo). Navega vía
 * router.push en vez de un link real, igual que /propiedades.
 */
export function FavoritesGrid({ favorites }: { favorites: PropertyCardData[] }) {
  const router = useRouter();

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {favorites.map((property) => (
        <PropertyCard
          key={property.id}
          property={property}
          onSelect={() => router.push(`/propiedades/${property.slug}`)}
        />
      ))}
    </div>
  );
}
