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
