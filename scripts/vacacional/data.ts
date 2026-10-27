/**
 * Datos del seed de alquileres temporales de la costa atlántica (`npm run seedVacacional`) y las reglas que lo comparten con su
 * comando inverso (`npm run eliminarSeedVacacional`). Es un módulo PURO (sin base de datos) para poder probar que lo que se va
 * a crear es coherente: ver `scripts/rentals-check.ts`.
 *
 * - Sólo se reutilizan inmobiliarias que ya existen (las del seed original); nunca se crean otras.
 * - *Inmobiliaria SS* y *test 1 santi* están excluidas por id Y por slug.
 * - Todo lo que se crea lleva `seedTag` + `seedKey`: así no se duplica y el inverso borra sólo eso.
 * - Fotos: enlaces de Unsplash ya revisados uno por uno (el sitio los muestra reducidos, sin gastar almacenamiento propio).
 * - Nada de datos de terceros: el contacto de cada propiedad es el de su inmobiliaria (las propiedades no tienen contacto propio).
 */
import type { Amenity, PropertyType } from "../../src/config/filters";
import type { PricePeriod } from "../../src/config/pricing";
import { addDays, todayAr, type BlockedRange } from "../../src/lib/availability";

export const SEED_TAG = "vacacional-v1";

/** Las inmobiliarias del seed original (por slug). El seed se detiene si falta alguna: no crea otras. */
export const SEED_AGENCY_SLUGS = ["umbral-norte-propiedades", "sur-urbano-inmobiliaria", "rio-bienes-raices", "casa-abierta-propiedades"] as const;

/** Excluidas por completo, por id real y por slug (el nombre visible puede cambiar; estos no). */
export const EXCLUDED_AGENCIES = {
  ids: ["6a9e1a2622a2aace3e629905", "6add6c04b6aef3cd6c0490a7"],
  slugs: ["inmobiliaria-ss", "test-1-santi"],
} as const;

export type Locality = "Mar del Plata" | "Aguas Verdes" | "Mar del Tuyú" | "Cariló";

/** Coordenadas del centro de cada localidad (verificadas con el buscador de direcciones del sitio). */
export const LOCALITY_CENTER: Record<Locality, { lng: number; lat: number; province: string }> = {
  "Mar del Plata": { lng: -57.5482, lat: -37.9976, province: "Buenos Aires" },
  "Aguas Verdes": { lng: -56.6849, lat: -36.6371, province: "Buenos Aires" },
  "Mar del Tuyú": { lng: -56.6875, lat: -36.5813, province: "Buenos Aires" },
  Cariló: { lng: -56.8998, lat: -37.1611, province: "Buenos Aires" },
};

// ── Fotos (Unsplash, revisadas) ─────────────────────────────────────────────
const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=1200&q=80&auto=format&fit=crop`;
export const PHOTO_POOLS = {
  /** Playas y mar abierto, sin palmeras (la costa atlántica argentina no las tiene). */
  beach: ["1507525428034-b723cf961d3e", "1473116763249-2faaef81ccda", "1471922694854-ff1b63b20054", "1505228395891-9a51e7e86bf6", "1500375592092-40eb2168fd21"],
  /** Frentes de casas con jardín, pileta o galería. */
  house: ["1580587771525-78b9dba3b914", "1613490493576-7fde63acd811", "1523217582562-09d0def993a6", "1572120360610-d971b9d7767c", "1576941089067-2de3c901e126", "1598228723793-52759bba239c"],
  /** Casas de bosque (Cariló). */
  cottage: ["1572120360610-d971b9d7767c", "1576941089067-2de3c901e126", "1598228723793-52759bba239c"],
  living: ["1505691938895-1758d7feb511", "1618221195710-dd6b41faaea6", "1493663284031-b7e3aefcae8e", "1586023492125-27b2c045efd7", "1560185007-cde436f6a4d0"],
  bedroom: ["1522771739844-6a9f6d5f14af", "1540518614846-7eded433c457"],
  kitchen: ["1484154218962-a197022b5858", "1507089947368-19c1da9775ae"],
  bath: ["1584622650111-993a426fbf0a", "1552321554-5fefe8c9ef14"],
} as const;

export const ALL_PHOTO_IDS: string[] = [...new Set(Object.values(PHOTO_POOLS).flat())];

// ── Propiedades ─────────────────────────────────────────────────────────────
type Busy = { fromDays: number; toDays: number; note?: string };

export type Listing = {
  /** Clave estable dentro del seed (parte de `seedKey`): no cambiar, evita duplicados al volver a correr. */
  key: string;
  locality: Locality;
  neighborhood: string;
  type: Extract<PropertyType, "departamento" | "duplex" | "casa">;
  title: string;
  description: string;
  rooms: number;
  bedrooms: number;
  bathrooms: number;
  garages: number;
  coveredArea: number;
  totalArea: number;
  price: { amount: number; currency: "ARS" | "USD"; period: Extract<PricePeriod, "noche" | "dia" | "semana" | "quincena" | "mensual"> };
  /** Metros a la playa (0 = frente al mar). */
  beachDistance: number;
  amenities: Amenity[];
  /** Si hoy se puede alquilar (manual) y los períodos ocupados, en días contados desde hoy (así el seed siempre muestra rojos y verdes). */
  availability: { state: "available" | "unavailable"; busy: Busy[] };
  /** Desplazamiento (en grados) respecto del centro de la localidad, para que los pines no se amontonen. */
  offset: { lng: number; lat: number };
};

export const LISTINGS: Listing[] = [
  // ── Mar del Plata ────────────────────────────────────────────────────────
  {
    key: "mdp-playa-grande-depto",
    locality: "Mar del Plata", neighborhood: "Playa Grande", type: "departamento",
    title: "Departamento de 2 ambientes con vista al mar en Playa Grande",
    description: "Departamento luminoso en Playa Grande, a pocos pasos de la playa, con balcón al mar. Dormitorio con cama matrimonial, living con sofá cama, cocina equipada y ropa blanca incluida. Ideal para dos o tres personas. Se alquila por noche, con mínimo de dos noches.",
    rooms: 2, bedrooms: 1, bathrooms: 1, garages: 0, coveredArea: 48, totalArea: 52,
    price: { amount: 78_000, currency: "ARS", period: "noche" }, beachDistance: 100,
    amenities: ["balcon", "aire_acondicionado", "amoblado", "calefaccion"],
    availability: { state: "available", busy: [{ fromDays: 12, toDays: 26 }, { fromDays: 60, toDays: 74 }] },
    offset: { lng: 0.0052, lat: -0.0267 },
  },
  {
    key: "mdp-punta-mogotes-duplex",
    locality: "Mar del Plata", neighborhood: "Punta Mogotes", type: "duplex",
    title: "Dúplex de 3 ambientes con parrilla a 300 metros del mar en Punta Mogotes",
    description: "Dúplex en dos plantas en Punta Mogotes: living-comedor y cocina abajo, dos dormitorios y baño completo arriba. Parrilla propia, cochera cubierta y patio. A tres cuadras de los balnearios. Se alquila por quincena.",
    rooms: 3, bedrooms: 2, bathrooms: 2, garages: 1, coveredArea: 92, totalArea: 130,
    price: { amount: 1_450_000, currency: "ARS", period: "quincena" }, beachDistance: 300,
    amenities: ["parrilla", "cochera", "jardin", "mascotas", "amoblado"],
    availability: { state: "available", busy: [{ fromDays: -2, toDays: 12, note: "Reservada hasta mitad de mes" }] },
    offset: { lng: -0.003, lat: -0.065 },
  },
  {
    key: "mdp-playa-grande-casa",
    locality: "Mar del Plata", neighborhood: "Playa Grande", type: "casa",
    title: "Casa de 4 ambientes con jardín y pileta en Playa Grande",
    description: "Casa amplia a pocas cuadras del mar, con jardín arbolado, pileta y galería con parrilla. Tres dormitorios, dos baños y cochera para dos autos. Acepta mascotas pequeñas. Se alquila por semana.",
    rooms: 4, bedrooms: 3, bathrooms: 2, garages: 2, coveredArea: 160, totalArea: 420,
    price: { amount: 690_000, currency: "ARS", period: "semana" }, beachDistance: 500,
    amenities: ["pileta", "parrilla", "jardin", "cochera", "mascotas", "aire_acondicionado"],
    availability: { state: "available", busy: [{ fromDays: 30, toDays: 44 }] },
    offset: { lng: 0.0027, lat: -0.0249 },
  },
  {
    key: "mdp-guemes-monoambiente",
    locality: "Mar del Plata", neighborhood: "Güemes", type: "departamento",
    title: "Monoambiente a estrenar en Güemes, cerca de la peatonal",
    description: "Monoambiente moderno en el corazón de Güemes, a 800 metros de la playa y a pasos de bares y restaurantes. Cama matrimonial, cocina integrada y baño completo. Se alquila por noche.",
    rooms: 1, bedrooms: 1, bathrooms: 1, garages: 0, coveredArea: 32, totalArea: 34,
    price: { amount: 52_000, currency: "ARS", period: "noche" }, beachDistance: 800,
    amenities: ["amoblado", "calefaccion", "aire_acondicionado"],
    availability: { state: "unavailable", busy: [] },
    offset: { lng: -0.0037, lat: -0.0176 },
  },
  // ── Aguas Verdes ─────────────────────────────────────────────────────────
  {
    key: "av-depto-100m",
    locality: "Aguas Verdes", neighborhood: "Aguas Verdes", type: "departamento",
    title: "Departamento de 2 ambientes a 100 metros de la playa en Aguas Verdes",
    description: "Departamento a una cuadra del mar, con balcón y aire acondicionado. Dormitorio con cama matrimonial, living con sofá cama para dos personas más y cocina completa. Acepta mascotas. Se alquila por noche.",
    rooms: 2, bedrooms: 1, bathrooms: 1, garages: 0, coveredArea: 45, totalArea: 48,
    price: { amount: 58_000, currency: "ARS", period: "noche" }, beachDistance: 100,
    amenities: ["balcon", "aire_acondicionado", "mascotas", "amoblado"],
    availability: { state: "available", busy: [{ fromDays: 8, toDays: 15 }] },
    offset: { lng: -0.0005, lat: 0.0015 },
  },
  {
    key: "av-duplex-200m",
    locality: "Aguas Verdes", neighborhood: "Aguas Verdes", type: "duplex",
    title: "Dúplex de 3 ambientes con parrilla a 200 metros del mar en Aguas Verdes",
    description: "Dúplex con patio y parrilla, a dos cuadras de la playa. Planta baja con living, cocina y baño; planta alta con dos dormitorios. Cochera para un auto. Se alquila por quincena.",
    rooms: 3, bedrooms: 2, bathrooms: 2, garages: 1, coveredArea: 78, totalArea: 110,
    price: { amount: 920_000, currency: "ARS", period: "quincena" }, beachDistance: 200,
    amenities: ["parrilla", "cochera", "jardin", "amoblado", "mascotas"],
    availability: { state: "available", busy: [{ fromDays: 20, toDays: 34 }, { fromDays: 55, toDays: 69 }] },
    offset: { lng: -0.0025, lat: 0.004 },
  },
  {
    key: "av-casa-pileta",
    locality: "Aguas Verdes", neighborhood: "Aguas Verdes", type: "casa",
    title: "Casa de 4 ambientes con pileta y parrilla a 300 metros de la playa en Aguas Verdes",
    description: "Casa con pileta, jardín y parrilla, ideal para familias o grupos de amigos. Tres dormitorios, dos baños, cochera y quincho. A tres cuadras del mar. Se alquila por semana.",
    rooms: 4, bedrooms: 3, bathrooms: 2, garages: 1, coveredArea: 120, totalArea: 360,
    price: { amount: 560_000, currency: "ARS", period: "semana" }, beachDistance: 300,
    amenities: ["pileta", "parrilla", "jardin", "cochera", "mascotas", "seguridad_24h"],
    availability: { state: "available", busy: [{ fromDays: -1, toDays: 6, note: "Ocupada esta semana" }] },
    offset: { lng: -0.001, lat: -0.003 },
  },
  {
    key: "av-depto-500m",
    locality: "Aguas Verdes", neighborhood: "Aguas Verdes", type: "departamento",
    title: "Departamento de 3 ambientes para 6 personas a 500 metros del mar en Aguas Verdes",
    description: "Departamento amplio con dos dormitorios, living comedor y balcón terraza. Equipado para seis personas, con cochera. Se alquila por noche, con descuento a partir de siete noches.",
    rooms: 3, bedrooms: 2, bathrooms: 1, garages: 1, coveredArea: 70, totalArea: 76,
    price: { amount: 69_000, currency: "ARS", period: "noche" }, beachDistance: 500,
    amenities: ["balcon", "terraza", "cochera", "amoblado", "aire_acondicionado"],
    availability: { state: "unavailable", busy: [] },
    offset: { lng: -0.0045, lat: -0.001 },
  },
  // ── Mar del Tuyú ─────────────────────────────────────────────────────────
  {
    key: "mdt-casa",
    locality: "Mar del Tuyú", neighborhood: "Mar del Tuyú", type: "casa",
    title: "Casa de 3 ambientes con jardín y parrilla en Mar del Tuyú",
    description: "Casa de una planta con jardín y parrilla, a 500 metros del mar. Dos dormitorios, baño completo y cochera. Acepta mascotas. Se alquila por semana.",
    rooms: 3, bedrooms: 2, bathrooms: 1, garages: 1, coveredArea: 85, totalArea: 300,
    price: { amount: 470_000, currency: "ARS", period: "semana" }, beachDistance: 500,
    amenities: ["parrilla", "jardin", "cochera", "mascotas", "amoblado"],
    availability: { state: "available", busy: [{ fromDays: 14, toDays: 28 }] },
    offset: { lng: 0.0015, lat: -0.003 },
  },
  {
    key: "mdt-depto",
    locality: "Mar del Tuyú", neighborhood: "Mar del Tuyú", type: "departamento",
    title: "Departamento de 2 ambientes a 200 metros de la playa en Mar del Tuyú",
    description: "Departamento en planta alta con balcón, a dos cuadras del mar. Dormitorio, living con sofá cama, cocina equipada y baño. Se alquila por noche.",
    rooms: 2, bedrooms: 1, bathrooms: 1, garages: 0, coveredArea: 42, totalArea: 46,
    price: { amount: 47_000, currency: "ARS", period: "noche" }, beachDistance: 200,
    amenities: ["balcon", "amoblado", "aire_acondicionado"],
    availability: { state: "available", busy: [] },
    offset: { lng: -0.003, lat: 0.003 },
  },
  {
    key: "mdt-duplex",
    locality: "Mar del Tuyú", neighborhood: "Mar del Tuyú", type: "duplex",
    title: "Dúplex de 3 ambientes con patio a 800 metros del mar en Mar del Tuyú",
    description: "Dúplex con patio y parrilla, tranquilo y familiar. Dos dormitorios, dos baños y cochera. A diez cuadras de la playa. Se alquila por quincena.",
    rooms: 3, bedrooms: 2, bathrooms: 2, garages: 1, coveredArea: 74, totalArea: 120,
    price: { amount: 780_000, currency: "ARS", period: "quincena" }, beachDistance: 800,
    amenities: ["parrilla", "jardin", "cochera", "mascotas"],
    availability: { state: "available", busy: [{ fromDays: -4, toDays: 3, note: "Se libera pronto" }] },
    offset: { lng: -0.006, lat: 0 },
  },
  // ── Cariló ───────────────────────────────────────────────────────────────
  {
    key: "car-casa-bosque-4",
    locality: "Cariló", neighborhood: "Cariló", type: "casa",
    title: "Casa en el bosque de 5 ambientes con pileta climatizada en Cariló",
    description: "Casa de bosque con pileta climatizada, quincho con parrilla y gran parque. Cuatro dormitorios en suite, cochera para tres autos y seguridad 24 horas del barrio. A 1,5 km de la playa. Se alquila por quincena, en dólares.",
    rooms: 5, bedrooms: 4, bathrooms: 4, garages: 3, coveredArea: 260, totalArea: 1_800,
    price: { amount: 3_600, currency: "USD", period: "quincena" }, beachDistance: 1500,
    amenities: ["pileta", "parrilla", "jardin", "cochera", "seguridad_24h", "aire_acondicionado", "calefaccion"],
    availability: { state: "available", busy: [{ fromDays: 25, toDays: 39 }, { fromDays: 70, toDays: 84 }] },
    offset: { lng: 0.006, lat: 0.006 },
  },
  {
    key: "car-casa-bosque-3",
    locality: "Cariló", neighborhood: "Cariló", type: "casa",
    title: "Casa de 4 ambientes entre pinos a 1 km de la playa en Cariló",
    description: "Casa de madera y piedra rodeada de pinos, con galería, parrilla y salamandra. Tres dormitorios, dos baños y cochera. Acepta mascotas. Se alquila por semana, en dólares.",
    rooms: 4, bedrooms: 3, bathrooms: 2, garages: 2, coveredArea: 170, totalArea: 1_200,
    price: { amount: 1_800, currency: "USD", period: "semana" }, beachDistance: 1000,
    amenities: ["parrilla", "jardin", "cochera", "mascotas", "calefaccion", "seguridad_24h"],
    availability: { state: "unavailable", busy: [] },
    offset: { lng: -0.012, lat: -0.006 },
  },
  {
    key: "car-casa-bosque-2",
    locality: "Cariló", neighborhood: "Cariló", type: "casa",
    title: "Casa de 3 ambientes con jardín a 800 metros del mar en Cariló",
    description: "Casa luminosa con jardín y parrilla, a diez minutos caminando de la playa. Dos dormitorios, baño completo y cochera. Se alquila por semana, en dólares.",
    rooms: 3, bedrooms: 2, bathrooms: 1, garages: 1, coveredArea: 110, totalArea: 900,
    price: { amount: 1_300, currency: "USD", period: "semana" }, beachDistance: 800,
    amenities: ["parrilla", "jardin", "cochera", "calefaccion"],
    availability: { state: "available", busy: [{ fromDays: 40, toDays: 54 }] },
    offset: { lng: 0.002, lat: -0.012 },
  },
];

/** Las fotos de una propiedad: portada (frente o living), una playa y los ambientes, sin repetir y coherentes con el tipo. */
export function photosFor(listing: Listing, index: number): string[] {
  const pick = <T,>(pool: readonly T[]): T => pool[index % pool.length]!;
  const ids =
    listing.type === "casa"
      ? [pick(listing.locality === "Cariló" ? PHOTO_POOLS.cottage : PHOTO_POOLS.house), pick(PHOTO_POOLS.living), pick(PHOTO_POOLS.bedroom), pick(PHOTO_POOLS.kitchen), pick(PHOTO_POOLS.bath), pick(PHOTO_POOLS.beach)]
      : [pick(PHOTO_POOLS.living), pick(PHOTO_POOLS.beach), pick(PHOTO_POOLS.bedroom), pick(PHOTO_POOLS.kitchen), pick(PHOTO_POOLS.bath)];
  return [...new Set(ids)].map(U);
}

/** Los períodos ocupados con fechas reales, a partir de hoy. */
export function resolveBlocked(listing: Listing, today: string = todayAr()): BlockedRange[] {
  return listing.availability.busy.map((b) => ({ from: addDays(today, b.fromDays), to: addDays(today, b.toDays), ...(b.note ? { note: b.note } : {}) }));
}

/** La clave única de una propiedad del seed. */
export const seedKeyOf = (listing: Listing): string => `${SEED_TAG}:${listing.key}`;
