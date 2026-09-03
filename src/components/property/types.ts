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
  isNew: boolean;
  agencyName?: string;
  lng: number;
  lat: number;
};

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
  videos: { url: string; thumbnail?: string }[];
  tour3d: { enabled: boolean; provider?: string; embedUrl?: string; thumbnail?: string } | null;

  stats: { views: number; likes: number; saves: number; comments: number; ratingAvg: number; ratingCount: number };

  agency: { id: string; slug: string; name: string; whatsapp?: string; phone?: string; email?: string } | null;

  publishedAt: string | null;
};
