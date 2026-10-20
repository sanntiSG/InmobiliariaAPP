/**
 * Extracción de entidades de la pregunta: período, métrica, zonas, tipos de
 * propiedad, operación, montos, porcentajes, ambientes, cantidades y
 * referencias a propiedades ("esa", "la segunda", el nombre de una publicación).
 * Las zonas y los títulos salen de los datos reales del alcance del usuario
 * (`EntityIndex`), así sólo se reconoce lo que existe y nunca se inventa.
 */
import { AMENITIES, type Amenity, type Operation, type PropertyType } from "@/config/filters";
import type { AdvisorContext, MetricId, Money, PeriodId, Slots } from "../types";
import { allowedTypos, isTypoOf } from "./fuzzy";
import { has, type Detected } from "./lexicon";
import { normalizeText, STOPWORDS, stem, tokenize } from "./normalize";

// ─── Índice de entidades del alcance ─────────────────────────────────────────

export type EntityIndex = {
  zones: { name: string; tokens: string[] }[];
  properties: { id: string; title: string; tokens: string[] }[];
};

const GENERIC_TITLE_WORDS = new Set(
  [
    "casa", "departamento", "depto", "dpto", "ph", "terreno", "lote", "local", "oficina", "galpon", "quinta",
    "venta", "alquiler", "temporal", "ambiente", "dormitorio", "habitacion", "hermoso", "hermosa", "excelente",
    "amplio", "amplia", "luminoso", "luminosa", "moderno", "moderna", "lindo", "linda", "con", "en", "de", "del",
    "y", "para", "sobre", "zona", "barrio", "piso", "nueva", "nuevo", "oportunidad", "impecable", "super",
  ].map(stem)
);

const cleanTokens = (norm: string): string[] => tokenize(norm).filter((t) => !STOPWORDS.has(t));

/** Arma el índice a partir de los barrios/ciudades y los títulos del alcance (sin repetidos). */
export function buildEntityIndex(input: {
  zones: Iterable<string>;
  properties: { id: string; title: string }[];
}): EntityIndex {
  const seen = new Set<string>();
  const zones: EntityIndex["zones"] = [];
  for (const name of input.zones) {
    const norm = normalizeText(name);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    const tokens = cleanTokens(norm).map(stem);
    if (tokens.length > 0) zones.push({ name, tokens });
  }
  const properties = input.properties.map((p) => ({
    id: p.id,
    title: p.title,
    tokens: [...new Set(cleanTokens(normalizeText(p.title)).map(stem).filter((t) => !GENERIC_TITLE_WORDS.has(t)))],
  }));
  return { zones, properties };
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

/** ¿El token de la pregunta (ya con raíz) equivale al token de la entidad? Tolera un error de tipeo en palabras largas. */
function sameToken(questionStem: string, entityStem: string): boolean {
  if (questionStem === entityStem) return true;
  return entityStem.length >= 5 && allowedTypos(entityStem.length) > 0 && isTypoOf(questionStem, entityStem);
}

const hasAllTokens = (questionStems: string[], entityTokens: string[]): boolean =>
  entityTokens.every((et) => questionStems.some((qt) => sameToken(qt, et)));

const PROPERTY_NOUN = /\b(propiedad(?:es)?|casa|casas|depto|deptos|departamento|departamentos|dpto|publicacion(?:es)?|aviso|avisos|opcion(?:es)?|ficha|fichas|inmueble|inmuebles|ph)\b/;

// ─── Entidades individuales ──────────────────────────────────────────────────

const TYPE_CONCEPTS: [string, PropertyType][] = [
  ["e.casa", "casa"],
  ["e.departamento", "departamento"],
  ["e.ph", "ph"],
  ["e.terreno", "terreno"],
  ["e.local", "local"],
  ["e.oficina", "oficina"],
  ["e.galpon", "galpon"],
  ["e.quinta", "quinta"],
];

const AMENITY_PATTERNS: [RegExp, Amenity][] = [
  [/\b(?:pileta|piscina|natatorio)\b/, "pileta"],
  [/\b(?:parrilla|quincho|asador)\b/, "parrilla"],
  [/\bbalcon\b/, "balcon"],
  [/\bterraza\b/, "terraza"],
  [/\bjardin\b|\bpatio\b/, "jardin"],
  [/\b(?:cochera|garage|garaje|estacionamiento)\b/, "cochera"],
  [/\bbaulera\b/, "baulera"],
  [/\bseguridad\b|\bvigilancia\b/, "seguridad_24h"],
  [/\b(?:gimnasio|gym)\b/, "gimnasio"],
  [/\bsum\b/, "sum"],
  [/\baire acondicionado\b|\bsplit\b/, "aire_acondicionado"],
  [/\bcalefaccion\b/, "calefaccion"],
  [/\bamoblad[oa]\b/, "amoblado"],
  [/\bapto credito\b|\bcredito hipotecario\b|\bcredito\b/, "apto_credito"],
  [/\bapto profesional\b|\bprofesional\b/, "apto_profesional"],
  [/\bmascotas?\b|\bpet friendly\b/, "mascotas"],
];

function detectAmenities(norm: string): Amenity[] {
  const found = AMENITY_PATTERNS.filter(([re]) => re.test(norm)).map(([, a]) => a);
  return [...new Set(found)].filter((a): a is Amenity => (AMENITIES as readonly string[]).includes(a));
}

function detectPeriod(d: Detected, norm: string): PeriodId | undefined {
  const prev = has(d, "t.prev");
  if (has(d, "t.today")) return "today";
  if (has(d, "t.yesterday")) return "yesterday";
  if (has(d, "t.month")) {
    // "respecto del mes pasado" compara contra el mes pasado: el período en curso sigue siendo el mes.
    return prev && !/\b(?:respecto|comparad|versus|vs|en relacion|que cambio|cambio)\b/.test(norm) ? "prev_month" : "month";
  }
  if (has(d, "t.week")) {
    return prev && !/\b(?:respecto|comparad|versus|vs|en relacion|que cambio|cambio)\b/.test(norm) ? "prev_week" : "week";
  }
  return undefined;
}

function detectMetric(d: Detected): MetricId | undefined {
  const order: [string, MetricId][] = [
    ["m.conversion", "conversion"],
    ["m.inquiries", "inquiries"],
    ["m.saves", "saves"],
    ["m.likes", "likes"],
    ["m.shares", "shares"],
    ["m.tour", "tour"],
    ["m.dwell", "dwell"],
    ["m.views", "views"],
    ["m.interest", "interest"],
  ];
  return order.find(([concept]) => d.has(concept))?.[1];
}

/** Monto + moneda en una ventana de tokens ("hasta 120000 usd", "desde usd 90000", "entre 80000 y 120000 dolares"). */
function detectMoney(norm: string): { priceMax?: Money; priceMin?: Money } {
  const tokens = tokenize(norm);
  const NOT_MONEY_NEXT = /^(?:ambiente|ambientes|amb|dormitorio|dormitorios|dorm|habitacion|habitaciones|cuarto|cuartos|m2|metros|metro|cuadras|cuadra|pisos?|dias|dia|semanas|semana|meses|mes|propiedades|propiedad|casas|casa|departamentos|departamento|deptos|depto|fotos|foto|visitas|consultas|%)$/;

  const parse = (i: number): { amount: number; currency: Money["currency"]; end: number } | null => {
    let j = i;
    let currency: Money["currency"] = null;
    if (tokens[j] === "usd" || tokens[j] === "ars") {
      currency = tokens[j] === "usd" ? "USD" : "ARS";
      j++;
    }
    const raw = tokens[j];
    if (!raw || !/^\d+(?:\.\d+)?$/.test(raw)) return null;
    const amount = Number.parseFloat(raw);
    j++;
    if (currency == null && (tokens[j] === "usd" || tokens[j] === "ars")) {
      currency = tokens[j] === "usd" ? "USD" : "ARS";
      j++;
    }
    const next = tokens[j];
    // Sin moneda, un número chico seguido de una unidad ("3 ambientes") no es dinero.
    if (currency == null && (amount < 1000 || (next && NOT_MONEY_NEXT.test(next)))) return null;
    if (amount < 100) return null;
    return { amount, currency, end: j };
  };

  const out: { priceMax?: Money; priceMin?: Money } = {};
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const isMax = t === "hasta" || t === "maximo" || t === "max" || t === "tope" || (t === "menos" && tokens[i + 1] === "de") || (t === "no" && tokens[i + 1] === "mas" && tokens[i + 2] === "de") || t === "menor" || t === "debajo";
    const isMin = t === "desde" || t === "minimo" || t === "min" || (t === "mas" && tokens[i + 1] === "de") || t === "mayor" || t === "arriba";
    if (!isMax && !isMin) {
      if (t === "entre") {
        const a = parse(i + 1);
        if (a) {
          const yIdx = tokens[a.end] === "y" ? a.end + 1 : a.end;
          const b = parse(yIdx);
          if (b) {
            const currency = a.currency ?? b.currency;
            out.priceMin = { amount: Math.min(a.amount, b.amount), currency };
            out.priceMax = { amount: Math.max(a.amount, b.amount), currency };
          }
        }
      }
      continue;
    }
    // Saltea "de", "a", "que".
    let k = i + 1;
    while (tokens[k] && ["de", "a", "que", "los", "las"].includes(tokens[k]!)) k++;
    const m = parse(k);
    if (!m) continue;
    const money: Money = { amount: m.amount, currency: m.currency };
    if (isMax) out.priceMax = money;
    else out.priceMin = money;
  }

  // Un monto suelto con moneda ("casa 100000 dolares") se toma como tope.
  if (!out.priceMax && !out.priceMin) {
    for (let i = 0; i < tokens.length; i++) {
      const m = parse(i);
      if (m && m.currency) {
        out.priceMax = { amount: m.amount, currency: m.currency };
        break;
      }
    }
  }
  return out;
}

const ORDINALS: [RegExp, number][] = [
  [/\bprimer[ao]?\b|\b1ra\b|\b1ro\b/, 0],
  [/\bsegund[ao]\b|\b2da\b|\b2do\b/, 1],
  [/\btercer[ao]?\b|\b3ra\b|\b3ro\b/, 2],
  [/\bcuart[ao]\b|\b4ta\b|\b4to\b/, 3],
  [/\bquint[ao]\b|\b5ta\b|\b5to\b/, 4],
];

/** Propiedades a las que se refiere la pregunta, según lo conversado o los títulos reales. */
function detectPropertyRefs(norm: string, tokens: string[], d: Detected, index: EntityIndex, ctx: AdvisorContext | undefined): string[] {
  const results = ctx?.resultIds ?? [];
  const mentionsNoun = PROPERTY_NOUN.test(norm);

  // "la primera", "la segunda propiedad".
  for (const [re, idx] of ORDINALS) {
    if (re.test(norm) && results[idx]) return [results[idx]!];
  }
  if (/\b(?:la )?ultim[ao]\b(?! (?:semana|mes|vez|dia|dias|hora|horas|30|7))/.test(norm) && results.length > 0 && (mentionsNoun || tokens.length <= 5)) {
    return [results[results.length - 1]!];
  }

  // "esas", "estas propiedades", "las mismas" → todo lo que se mostró.
  if (has(d, "ctx.those") && results.length > 0 && (mentionsNoun || tokens.length <= 6)) return results.slice(0, 20);

  // "esta propiedad", "ese depto" ("esta semana" o "este mes" no se refieren a una propiedad).
  const deictic = /\b(?:esta|este|ese|esa|eso|esto)\b(?! (?:semana|mes|dia|hora|vez|ano|trimestre|momento|periodo|tiempo))/.test(norm);
  if (has(d, "ctx.this") && deictic && (mentionsNoun || tokens.length <= 4)) {
    if (ctx?.focusPropertyId) return [ctx.focusPropertyId];
    if (results.length === 1) return [results[0]!];
  }

  // Por título: exige varias palabras distintivas en común (o el nombre propio entero), nunca sólo la zona.
  const qStems = tokens.map(stem);
  const zoneTokens = new Set(index.zones.flatMap((z) => z.tokens));
  const scored: { id: string; shared: number; frac: number; own: number }[] = [];
  for (const p of index.properties) {
    if (p.tokens.length === 0) continue;
    const shared = p.tokens.filter((t) => qStems.some((q) => sameToken(q, t)));
    if (shared.length === 0) continue;
    const own = shared.filter((t) => !zoneTokens.has(t)).length;
    if (own === 0) continue;
    const frac = shared.length / p.tokens.length;
    if ((shared.length >= 2 && frac >= 0.5) || (p.tokens.length === 1 && shared.length === 1 && shared[0]!.length >= 4)) {
      scored.push({ id: p.id, shared: shared.length, frac, own });
    }
  }
  // Título completo escrito ("casa en venta en Puerto Madero"): vale aunque todas sus palabras distintivas sean la zona,
  // siempre que no se pida en plural ("casas en Puerto Madero" es un filtro, no una propiedad).
  if (scored.length === 0 && !/\b(?:casas|departamentos|deptos|propiedades|inmuebles|ph|terrenos|locales|oficinas)\b/.test(norm)) {
    for (const p of index.properties) {
      const full = cleanTokens(normalizeText(p.title)).map(stem);
      if (full.length < 3) continue;
      const shared = full.filter((t) => qStems.some((q) => sameToken(q, t)));
      if (shared.length >= 3 && shared.length / full.length >= 0.8) scored.push({ id: p.id, shared: shared.length, frac: shared.length / full.length, own: 0 });
    }
  }
  if (scored.length > 0) {
    scored.sort((a, b) => b.frac - a.frac || b.shared - a.shared);
    const top = scored[0]!;
    return scored.filter((s) => s.frac === top.frac && s.shared === top.shared).slice(0, 3).map((s) => s.id);
  }
  return [];
}

function detectZones(tokens: string[], index: EntityIndex): string[] {
  const qStems = tokens.map(stem);
  const hits = index.zones.filter((z) => hasAllTokens(qStems, z.tokens));
  // Si una zona está contenida en otra que también coincide, gana la más específica.
  const specific = hits.filter((z) => !hits.some((o) => o !== z && o.tokens.length > z.tokens.length && z.tokens.every((t) => o.tokens.includes(t))));
  return specific.slice(0, 3).map((z) => z.name);
}

// ─── Punto de entrada ────────────────────────────────────────────────────────

export function extractSlots(norm: string, tokens: string[], detected: Detected, index: EntityIndex, ctx?: AdvisorContext): Slots {
  const slots: Slots = {};

  const period = detectPeriod(detected, norm);
  if (period) slots.period = period;
  const metric = detectMetric(detected);
  if (metric) slots.metric = metric;

  const types = TYPE_CONCEPTS.filter(([concept]) => detected.has(concept)).map(([, type]) => type);
  if (types.length > 0) slots.types = types;

  if (has(detected, "e.temporal")) slots.operation = "alquiler_temporal" satisfies Operation;
  else if (has(detected, "e.alquiler") && !has(detected, "e.venta")) slots.operation = "alquiler";
  else if (has(detected, "e.venta") && !has(detected, "e.alquiler")) slots.operation = "venta";

  const zones = detectZones(tokens, index);
  if (zones.length > 0) slots.zones = zones;

  const rooms = norm.match(/(\d+)\s*(?:ambientes?|amb)\b/);
  if (rooms) slots.rooms = Number(rooms[1]);
  else if (/\bmonoambiente\b/.test(norm)) slots.rooms = 1;
  const beds = norm.match(/(\d+)\s*(?:dormitorios?|dorm|habitaciones|habitacion|cuartos?)\b/);
  if (beds) slots.bedrooms = Number(beds[1]);

  const amenities = detectAmenities(norm);
  if (amenities.length > 0) slots.amenities = amenities;

  const count = norm.match(/(?:\btop |\b)(\d{1,2})\s*(?:propiedades|propiedad|casas|departamentos|deptos|inmuebles|publicaciones|avisos|opciones|mejores|peores|acciones|ideas|recomendaciones|consejos|pasos|cosas)\b/);
  if (count) slots.count = Math.min(10, Math.max(1, Number(count[1])));

  const pct = norm.match(/(\d+(?:\.\d+)?)%/);
  if (pct) {
    const value = Number.parseFloat(pct[1]!);
    const raise = has(detected, "v.raise") && !has(detected, "v.drop");
    slots.percent = raise ? value : -value;
  }

  Object.assign(slots, detectMoney(norm));

  const refs = detectPropertyRefs(norm, tokens, detected, index, ctx);
  if (refs.length > 0) slots.propertyIds = refs;

  if (has(detected, "v.worst")) slots.direction = "worst";
  else if (has(detected, "v.best")) slots.direction = "best";

  // Qué parte de la ficha se tocó (para medir el impacto de ese cambio puntual).
  if (has(detected, "d.photos")) slots.field = "photos";
  else if (has(detected, "d.description")) slots.field = "description";
  else if (has(detected, "d.video")) slots.field = "videos";
  else if (has(detected, "m.tour")) slots.field = "tour360";
  else if (has(detected, "d.price") || has(detected, "v.drop")) slots.field = "price";

  return slots;
}
