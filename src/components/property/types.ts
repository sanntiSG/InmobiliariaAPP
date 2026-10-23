import type { TourScene, VirtualTourConfig } from "@/components/tour/tour-types";
import type { AmbientManifest } from "@/vendor/ambient";

/** Portada viva de una propiedad, lista para el reproductor de la ficha (el póster es la imagen de tarjetas). */
export type PropertyAmbient = {
  coverId: string;
  /** Carpeta de archivos, con `/` final y sin versión. */
  baseUrl: string;
  manifest: AmbientManifest;
  /** Estados activos, en el orden del manifest. */
  states: string[];
  /** `"auto"` (según la hora de quien mira) o el id de un estado. */
  start: string;
  poster: { url: string; width?: number; height?: number };
};

/** Forma liviana de propiedad usada por el mapa, el panel de resultados y sus cards. */
export type PropertyCardData = {
  id: string;
  slug: string;
  title: string;
  price: number;
  currency: string;
  period: "total" | "mensual";
  operation: string;
  type: string;
  neighborhood?: string;
  city: string;
  image: string | null;
  bedrooms?: number;
  bathrooms?: number;
  area?: number;
  tour3d: boolean;
  /** Tiene portada viva: `image` ya es su póster y las tarjetas muestran una insignia. */
  ambient?: boolean;
  isNew: boolean;
  agencyName?: string;
  /** Para enlazar al perfil público de la inmobiliaria (`/inmobiliarias/[slug]`). */
  agencySlug?: string;
  agencyLogo?: string;
  lng: number;
  lat: number;
  /** Sólo en recomendaciones: por qué se le sugiere esta propiedad a la persona. */
  reason?: string;
};

/**
 * Un recorrido 360° — foto equirectangular subida por la inmobiliaria,
 * renderizada con `Photo360Viewer` (Photo Sphere Viewer). Una propiedad
 * puede tener varios (`PropertyDetail.tours`) — distintos ambientes.
 */
export type Tour3DEntry = TourScene;

/** Forma completa de una propiedad, usada por la página de detalle. */
export type PropertyDetail = {
  id: string;
  slug: string;
  title: string;
  description: string;
  operation: string;
  type: string;
  status: string;

  price: { amount: number; currency: string; expenses: number; period: "total" | "mensual" };

  address: {
    street?: string;
    number?: string;
    neighborhood?: string;
    city: string;
    province?: string;
    country: string;
    showExact: boolean;
  };
  lng: number;
  lat: number;

  features: {
    rooms?: number;
    bedrooms?: number;
    bathrooms?: number;
    garages?: number;
    coveredArea?: number;
    totalArea?: number;
    age?: number;
    floor?: number;
    orientation?: string;
  };
  amenities: string[];

  images: { url: string; alt: string }[];
  videos: { videoId: string; title?: string; orientation: "vertical" | "horizontal" }[];
  tours: Tour3DEntry[];
  virtualTour: VirtualTourConfig;
  /** `null` = la propiedad usa foto tradicional como portada. */
  ambient: PropertyAmbient | null;

  stats: { views: number; likes: number; saves: number; comments: number; ratingAvg: number; ratingCount: number };

  agency: { id: string; slug: string; name: string; logo?: string; whatsapp?: string; phone?: string; email?: string } | null;

  publishedAt: string | null;
};
