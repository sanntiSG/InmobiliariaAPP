/**
 * Tipos compartidos del asesor. El cliente sólo hace `import type` de este
 * archivo (nunca arrastra mongoose): es el contrato entre el servidor, que
 * resuelve la consulta, y la interfaz, que la dibuja.
 */
import type { Diagnostic } from "@/lib/intelligence/diagnostics";
import type { Amenity, Currency, Operation, PropertyType } from "@/config/filters";
import type { PropertyCardData } from "@/components/property/types";

export type AdvisorMode = "agency" | "explorer";

// ─── Intenciones ─────────────────────────────────────────────────────────────

export const AGENCY_INTENTS = [
  "agency.overview",
  "agency.metric",
  "agency.worst",
  "agency.best",
  "agency.views_no_inquiries",
  "agency.investigate",
  "agency.changes_vs_previous",
  "agency.review_first",
  "agency.compare_zones",
  "agency.type_interest",
  "agency.traits",
  "agency.actions",
  "agency.photos",
  "agency.incomplete",
  "agency.stale_inquiries",
  "agency.opportunities",
  "agency.simulate_price",
  "agency.similar_price",
  "agency.promote",
  "agency.activity",
  "agency.change_impact",
  "agency.property_status",
  "agency.leads",
  "agency.ambient_cover",
] as const;

export const EXPLORER_INTENTS = [
  "explorer.search",
  "explorer.recommend",
  "explorer.price_drops",
  "explorer.price_typical",
  "explorer.compare",
  "explorer.price_check",
  "explorer.with_tour",
  "explorer.with_ambient",
  "explorer.new",
  "explorer.popular",
  "explorer.agencies",
  "explorer.about_property",
] as const;

/**
 * Intenciones que no gastan el cupo gratuito de quien no inició sesión: describen una propiedad pública que la persona
 * ya está mirando (botón de la ficha). Las compartimos entre el servidor (no descuenta) y el cliente (no bloquea el botón
 * aunque el cupo de preguntas libres esté agotado). Siguen sujetas al límite por minuto.
 */
export const FREE_INTENTS: readonly IntentId[] = ["explorer.about_property"];
export const isFreeIntent = (intent: string): boolean => (FREE_INTENTS as readonly string[]).includes(intent);

export const COMMON_INTENTS = ["common.greeting", "common.thanks", "common.help"] as const;

export type AgencyIntent = (typeof AGENCY_INTENTS)[number];
export type ExplorerIntent = (typeof EXPLORER_INTENTS)[number];
export type CommonIntent = (typeof COMMON_INTENTS)[number];
export type IntentId = AgencyIntent | ExplorerIntent | CommonIntent;

// ─── Entidades / slots ───────────────────────────────────────────────────────

export type PeriodId = "today" | "yesterday" | "week" | "prev_week" | "month" | "prev_month";
export type MetricId = "views" | "inquiries" | "saves" | "likes" | "shares" | "tour" | "dwell" | "interest" | "conversion";
export type Money = { amount: number; currency: Currency | null };

/** Lo que se entendió de la pregunta: se completa con el contexto en los seguimientos. */
export type Slots = {
  period?: PeriodId;
  metric?: MetricId;
  /** `worst` / `best` cuando la pregunta pide un extremo. */
  direction?: "worst" | "best";
  zones?: string[];
  types?: PropertyType[];
  operation?: Operation;
  /** Ids de propiedades a las que se refiere la pregunta (título, "esta", "las primeras"…). */
  propertyIds?: string[];
  /** Variación de precio pedida en una simulación: -5 = bajar 5 %. */
  percent?: number;
  priceMax?: Money;
  priceMin?: Money;
  rooms?: number;
  bedrooms?: number;
  amenities?: Amenity[];
  /** "tres propiedades" → 3. */
  count?: number;
  withTour?: boolean;
  /** Sólo propiedades con portada viva. */
  withAmbient?: boolean;
  /** Qué parte de la publicación se cambió ("¿sirvió cambiar las fotos?"). */
  field?: ChangeField;
  /** Texto libre de búsqueda (nombre de zona no reconocida, etc.). */
  text?: string;
};

export type ChangeField = "price" | "photos" | "description" | "videos" | "tour360" | "ambient";

// ─── Contexto de la conversación (viaja del cliente al servidor en cada pregunta) ──

export type AdvisorContext = {
  turn: number;
  lastIntent?: IntentId;
  lastSlots?: Slots;
  /** Propiedades mostradas en la última respuesta: "esas", "la primera", "la segunda". */
  resultIds?: string[];
  /** Propiedad de la que se viene hablando (o la ficha en la que está el explorador). */
  focusPropertyId?: string;
};

// ─── Respuesta ───────────────────────────────────────────────────────────────

/** Una sugerencia que el usuario toca: viaja como consulta estructurada y se resuelve sin pasar por el lenguaje. */
export type SuggestionQuery = {
  intent: IntentId;
  slots?: Slots;
  label: string;
  /** Dato de adelanto que se muestra en el chip: "+32 % visitas". */
  hint?: string;
  tone?: "neutral" | "good" | "warn";
};

export type Tone = "good" | "bad" | "neutral";

export type PropertyRef = {
  id: string;
  title: string;
  slug: string;
  image: string | null;
  place: string | null;
  /** "US$120.000" */
  price: string;
  /** Chips cortos: "42 visitas", "2 consultas". */
  chips: string[];
  /** Una línea de contexto: "Le bajaste el precio hace 5 días". */
  note?: string;
  /** Destino principal al tocar la fila. */
  href: string;
  /** Accesos directos: estadísticas, editar, ver la ficha. */
  links?: { label: string; href: string }[];
  tone?: Tone;
};

export type TableCell = string | number | { text: string; tone?: Tone };

export type TrendBlockPoint = {
  day: string;
  views: number;
  saves: number;
  likes: number;
  inquiries: number;
  contacts: number;
};

/** Ícono de una fila de datos de la propiedad (bloque `facts`). */
export type FactIcon =
  | "price"
  | "expenses"
  | "place"
  | "rooms"
  | "bedrooms"
  | "bathrooms"
  | "area"
  | "garage"
  | "age"
  | "floor"
  | "orientation"
  | "amenity"
  | "tour"
  | "ambient"
  | "video";

export type AdvisorBlock =
  | { type: "text"; text: string }
  | { type: "facts"; title?: string; items: { icon: FactIcon; label: string; value: string }[] }
  | {
      /** Si la propiedad encaja con lo que busca la persona: tono, qué coincide y qué no, y a dónde ir a ajustarlo. */
      type: "verdict";
      tone: "yes" | "maybe" | "no" | "unknown";
      title: string;
      matches: string[];
      misses: string[];
      note?: string;
      actions?: AdvisorAction[];
    }
  | {
      type: "metrics";
      items: { label: string; value: string; delta?: number | null; hint?: string; tone?: Tone }[];
    }
  | { type: "trend"; label: string; points: TrendBlockPoint[] }
  | { type: "bars"; items: { label: string; value: number; valueText?: string; sublabel?: string; href?: string }[] }
  | {
      type: "table";
      caption?: string;
      columns: { key: string; label: string; align?: "left" | "right" }[];
      rows: Record<string, TableCell>[];
    }
  | { type: "properties"; title?: string; items: PropertyRef[] }
  | { type: "cards"; title?: string; items: PropertyCardData[] }
  | { type: "diagnostics"; items: Diagnostic[] }
  | { type: "timeline"; items: { at: string; title: string; detail?: string; tone?: Tone; href?: string }[] }
  | { type: "simulation"; title: string; rows: { label: string; value: string }[]; note: string }
  | { type: "caveat"; text: string };

export type AdvisorAction = { label: string; href: string; kind?: "primary" | "secondary" };

export type AdvisorQuota = { limit: number; used: number; remaining: number; requiresAccount: boolean };

export type AdvisorAnswer = {
  intent: IntentId | "clarify" | "quota" | "unknown";
  /** 0..1 */
  confidence: number;
  /** `surprised` cuando hay un hallazgo fuera de lo común. */
  mood: "neutral" | "surprised";
  /** Texto principal: es el que aparece letra a letra mientras la mascota habla. */
  lead: string;
  blocks: AdvisorBlock[];
  followUps: SuggestionQuery[];
  actions: AdvisorAction[];
  context: AdvisorContext;
  quota?: AdvisorQuota;
  /** `true` si hay números hipotéticos (simulaciones): la interfaz los marca. */
  simulated?: boolean;
};

export type AdvisorBriefing = {
  greeting: string;
  /** 1 o 2 titulares sobre lo que se detectó. */
  headlines: { text: string; tone?: Tone }[];
  suggestions: SuggestionQuery[];
  quota?: AdvisorQuota;
  mood: "neutral" | "surprised";
};

export type AdvisorInput = { text: string } | { query: { intent: IntentId; slots?: Slots } };
