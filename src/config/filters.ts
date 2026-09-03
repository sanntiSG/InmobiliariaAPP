/**
 * Vocabulario compartido de filtros y valores enumerados.
 * Un solo lugar consumido por los modelos de Mongo, la validación Zod
 * y los componentes de filtro en la UI — evita que se desincronicen.
 */

export const OPERATIONS = ["venta", "alquiler", "alquiler_temporal"] as const;
export type Operation = (typeof OPERATIONS)[number];

export const OPERATION_LABELS: Record<Operation, string> = {
  venta: "Venta",
  alquiler: "Alquiler",
  alquiler_temporal: "Alquiler temporal",
};

export const PROPERTY_TYPES = [
  "casa",
  "departamento",
  "ph",
  "terreno",
  "local",
  "oficina",
  "galpon",
  "quinta",
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  casa: "Casa",
  departamento: "Departamento",
  ph: "PH",
  terreno: "Terreno",
  local: "Local",
  oficina: "Oficina",
  galpon: "Galpón",
  quinta: "Quinta",
};

export const PROPERTY_STATUSES = [
  "draft",
  "published",
  "reserved",
  "sold",
  "rented",
  "archived",
] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export const PROPERTY_STATUS_LABELS: Record<PropertyStatus, string> = {
  draft: "Borrador",
  published: "Publicada",
  reserved: "Reservada",
  sold: "Vendida",
  rented: "Alquilada",
  archived: "Archivada",
};

export const AMENITIES = [
  "pileta",
  "parrilla",
  "balcon",
  "terraza",
  "jardin",
  "cochera",
  "baulera",
  "seguridad_24h",
  "gimnasio",
  "sum",
  "aire_acondicionado",
  "calefaccion",
  "amoblado",
  "apto_credito",
  "apto_profesional",
  "mascotas",
] as const;
export type Amenity = (typeof AMENITIES)[number];

export const AMENITY_LABELS: Record<Amenity, string> = {
  pileta: "Pileta",
  parrilla: "Parrilla",
  balcon: "Balcón",
  terraza: "Terraza",
  jardin: "Jardín",
  cochera: "Cochera",
  baulera: "Baulera",
  seguridad_24h: "Seguridad 24h",
  gimnasio: "Gimnasio",
  sum: "SUM",
  aire_acondicionado: "Aire acondicionado",
  calefaccion: "Calefacción",
  amoblado: "Amoblado",
  apto_credito: "Apto crédito",
  apto_profesional: "Apto profesional",
  mascotas: "Acepta mascotas",
};

export const CURRENCIES = ["USD", "ARS"] as const;
export type Currency = (typeof CURRENCIES)[number];
