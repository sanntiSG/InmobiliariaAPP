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

/**
 * Un recorrido / Digital Twin — "iframe" para links hosteados (Matterport,
 * el visor de Polycam, Kuula, Sketchfab...), "mesh" para la URL de un
 * archivo glb/gltf/usdz ya hosteado (renderizado con <model-viewer>),
 * "photo360" para una foto equirectangular subida por la inmobiliaria
 * (renderizada con `Photo360Viewer`, Photo Sphere Viewer). Una propiedad
 * puede tener varios (`PropertyDetail.tours`).
 */
export type Tour3DEntry = {
  label?: string;
  kind: "iframe" | "mesh" | "photo360";
  provider?: string;
  embedUrl?: string;
  meshUrl?: string;
  meshFormat?: "glb" | "gltf" | "usdz";
  photo360Url?: string;
  thumbnail?: string;
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
  tours: Tour3DEntry[];

  stats: { views: number; likes: number; saves: number; comments: number; ratingAvg: number; ratingCount: number };

  agency: { id: string; slug: string; name: string; whatsapp?: string; phone?: string; email?: string } | null;

  publishedAt: string | null;
};
