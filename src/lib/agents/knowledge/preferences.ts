/**
 * ¿Esta propiedad encaja con lo que busca la persona? Función pura y determinística (sin IA): compara la propiedad con
 * las preferencias que la persona guardó en su perfil o, si no hay, con lo que viene mirando (perfil de gustos). Devuelve
 * criterio por criterio, para poder explicar el "por qué" con palabras y no solo un puntaje.
 */
import { AMENITY_LABELS, OPERATION_LABELS, type Amenity, type Operation } from "@/config/filters";
import { list, money } from "@/lib/advisor/compose/format";
import { typeLabel } from "@/lib/advisor/compose/vocab";
import { priceKey, type TasteProfileData } from "@/lib/intelligence/user-profile";

export type PrefInput = {
  operations?: string[] | null;
  propertyTypes?: string[] | null;
  locations?: string[] | null;
  priceMin?: number | null;
  priceMax?: number | null;
  /** Moneda del rango de precio; si falta se infiere de la operación buscada. */
  priceCurrency?: string | null;
  minRooms?: number | null;
  amenities?: string[] | null;
};

export type PrefProperty = {
  operation: string;
  type: string;
  neighborhood?: string | null;
  city: string;
  price: { amount: number; currency: string };
  rooms?: number | null;
  bedrooms?: number | null;
  amenities: string[];
};

export type FitCriterion = {
  key: "operation" | "type" | "location" | "price" | "rooms" | "amenity" | "taste";
  weight: number;
  result: "match" | "near" | "miss" | "unknown";
  text: string;
};

export type Fit = {
  /** De dónde salen los criterios: preferencias guardadas, lo que viene mirando, o nada. */
  source: "explicit" | "taste" | "none";
  criteria: FitCriterion[];
  /** 0..1 sobre los criterios que se pudieron evaluar; `null` si no hubo ninguno. */
  ratio: number | null;
  verdict: "yes" | "maybe" | "no" | "unknown";
};

const SCORE = { match: 1, near: 0.5, miss: 0, unknown: 0 } as const;
/** Pasarse hasta un 10 % del tope (o quedar un 10 % abajo del piso) cuenta como "cerca". */
const PRICE_TOLERANCE = 0.1;

const strip = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const opLabel = (op: string): string => (OPERATION_LABELS[op as Operation] ?? op).toLowerCase();
const typeName = (t: string): string => typeLabel(t, false);
const amenityName = (a: string): string => (AMENITY_LABELS[a as Amenity] ?? a).toLowerCase();

/** Hay preferencias guardadas si la persona completó al menos una. */
export function hasExplicitPreferences(p: PrefInput | null | undefined): boolean {
  if (!p) return false;
  return !!(
    p.operations?.length ||
    p.propertyTypes?.length ||
    p.locations?.length ||
    p.priceMin != null ||
    p.priceMax != null ||
    p.minRooms != null ||
    p.amenities?.length
  );
}

/** Moneda del rango de precio: la elegida, o la que corresponde a lo que busca (venta → USD; alquiler → ARS). */
function priceCurrencyOf(p: PrefInput): string | null {
  if (p.priceCurrency) return p.priceCurrency;
  const ops = p.operations ?? [];
  if (ops.length > 0 && ops.every((o) => o === "venta")) return "USD";
  if (ops.length > 0 && ops.every((o) => o !== "venta")) return "ARS";
  return null;
}

function priceCriterion(prop: PrefProperty, prefs: PrefInput): FitCriterion | null {
  if (prefs.priceMin == null && prefs.priceMax == null) return null;
  const currency = priceCurrencyOf(prefs);
  if (!currency) {
    return { key: "price", weight: 3, result: "unknown", text: "Tu rango de precio no dice en qué moneda está: no lo comparé." };
  }
  if (currency !== prop.price.currency) {
    return {
      key: "price",
      weight: 3,
      result: "unknown",
      text: `Tu rango de precio está en ${currency} y esta propiedad se publica en ${prop.price.currency}: no lo mezclé.`,
    };
  }
  const amount = prop.price.amount;
  const { priceMin: min, priceMax: max } = prefs;
  const price = money(amount, currency);
  if ((min == null || amount >= min) && (max == null || amount <= max)) {
    return { key: "price", weight: 3, result: "match", text: `Su precio (${price}) está dentro de tu rango.` };
  }
  if (max != null && amount > max) {
    const over = Math.round(((amount - max) / max) * 100);
    return amount <= max * (1 + PRICE_TOLERANCE)
      ? { key: "price", weight: 3, result: "near", text: `Se pasa un ${over} % de tu tope (${money(max, currency)}).` }
      : { key: "price", weight: 3, result: "miss", text: `Está por encima de tu tope de ${money(max, currency)} (${price}).` };
  }
  const floor = min ?? 0;
  return amount >= floor * (1 - PRICE_TOLERANCE)
    ? { key: "price", weight: 3, result: "near", text: `Queda apenas por debajo de tu mínimo (${money(floor, currency)}).` }
    : { key: "price", weight: 3, result: "miss", text: `Está por debajo de lo que buscabas (${price}).` };
}

function explicitCriteria(prop: PrefProperty, prefs: PrefInput): FitCriterion[] {
  const out: FitCriterion[] = [];

  if (prefs.operations?.length) {
    const ok = prefs.operations.includes(prop.operation);
    out.push({
      key: "operation",
      weight: 3,
      result: ok ? "match" : "miss",
      text: ok ? `Es ${opLabel(prop.operation)}, como buscás.` : `Buscás ${list(prefs.operations.map(opLabel))} y esta es ${opLabel(prop.operation)}.`,
    });
  }

  if (prefs.locations?.length) {
    const hay = [prop.neighborhood, prop.city].filter((s): s is string => !!s).map(strip);
    const hit = prefs.locations.find((l) => hay.some((h) => h.includes(strip(l)) || strip(l).includes(h)));
    out.push({
      key: "location",
      weight: 3,
      result: hit ? "match" : "miss",
      text: hit ? `Está en ${prop.neighborhood ?? prop.city}, una de tus zonas.` : `No está en ninguna de tus zonas (${list(prefs.locations.slice(0, 3))}).`,
    });
  }

  const price = priceCriterion(prop, prefs);
  if (price) out.push(price);

  if (prefs.propertyTypes?.length) {
    const ok = prefs.propertyTypes.includes(prop.type);
    out.push({
      key: "type",
      weight: 2,
      result: ok ? "match" : "miss",
      text: ok ? `Es ${typeName(prop.type)}, un tipo que buscás.` : `Es ${typeName(prop.type)} y vos buscás ${list(prefs.propertyTypes.map(typeName))}.`,
    });
  }

  if (prefs.minRooms != null && prefs.minRooms > 0) {
    // "Ambientes mínimos": se compara contra los ambientes (no los dormitorios); si falta el dato, dormitorios + 1.
    const rooms = prop.rooms ?? (prop.bedrooms != null ? prop.bedrooms + 1 : null);
    if (rooms == null) {
      out.push({ key: "rooms", weight: 1, result: "unknown", text: "No tiene cargada la cantidad de ambientes." });
    } else if (rooms >= prefs.minRooms) {
      out.push({ key: "rooms", weight: 1, result: "match", text: `Tiene ${rooms} ambientes (pedías al menos ${prefs.minRooms}).` });
    } else if (rooms === prefs.minRooms - 1) {
      out.push({ key: "rooms", weight: 1, result: "near", text: `Tiene ${rooms} ambientes, uno menos de lo que pedías.` });
    } else {
      out.push({ key: "rooms", weight: 1, result: "miss", text: `Tiene ${rooms} ambientes y pedías al menos ${prefs.minRooms}.` });
    }
  }

  for (const a of (prefs.amenities ?? []).slice(0, 2)) {
    const ok = prop.amenities.includes(a);
    out.push({
      key: "amenity",
      weight: 1,
      result: ok ? "match" : "miss",
      text: ok ? `Tiene ${amenityName(a)}.` : `No tiene ${amenityName(a)}, que buscabas.`,
    });
  }
  return out;
}

const shareOf = (items: { key: string; weight: number }[], key: string | null | undefined): number =>
  key ? (items.find((i) => strip(i.key) === strip(key))?.weight ?? 0) : 0;

/** Criterios a partir de lo que la persona viene mirando (sin preferencias guardadas). Ninguno es "duro". */
function tasteCriteria(prop: PrefProperty, taste: TasteProfileData): FitCriterion[] {
  const out: FitCriterion[] = [];

  if (taste.operations.length) {
    const s = shareOf(taste.operations, prop.operation);
    out.push({
      key: "taste",
      weight: 3,
      result: s >= 0.4 ? "match" : s > 0 ? "near" : "miss",
      text: s > 0 ? `Es ${opLabel(prop.operation)}, como lo que venís mirando.` : `Venís mirando otra operación: esta es ${opLabel(prop.operation)}.`,
    });
  }
  if (taste.neighborhoods.length) {
    const s = shareOf(taste.neighborhoods, prop.neighborhood ?? prop.city);
    out.push({
      key: "taste",
      weight: 3,
      result: s >= 0.15 ? "match" : s > 0 ? "near" : "miss",
      text: s > 0 ? `Está en ${prop.neighborhood ?? prop.city}, una zona que venís mirando.` : "Está en una zona que todavía no miraste.",
    });
  }
  if (taste.types.length) {
    const s = shareOf(taste.types, prop.type);
    out.push({
      key: "taste",
      weight: 2,
      result: s >= 0.2 ? "match" : s > 0 ? "near" : "miss",
      text: s > 0 ? `Es ${typeName(prop.type)}, un tipo que venís mirando.` : `Es ${typeName(prop.type)}, que todavía no habías mirado.`,
    });
  }
  const band = taste.prices.find((p) => p.key === priceKey(prop.operation, prop.price.currency));
  if (band) {
    const { amount, currency } = prop.price;
    const inside = amount >= band.low * (1 - PRICE_TOLERANCE) && amount <= band.high * (1 + PRICE_TOLERANCE);
    out.push({
      key: "taste",
      weight: 3,
      result: inside ? "match" : "miss",
      text: inside ? `Su precio (${money(amount, currency)}) está en el rango que venís mirando.` : `Su precio (${money(amount, currency)}) se sale del rango que venís mirando.`,
    });
  }
  return out;
}

function scoreOf(criteria: FitCriterion[]): number | null {
  const usable = criteria.filter((c) => c.result !== "unknown");
  const total = usable.reduce((s, c) => s + c.weight, 0);
  if (total === 0) return null;
  return usable.reduce((s, c) => s + c.weight * SCORE[c.result], 0) / total;
}

/**
 * Veredicto: `no` si falla un criterio duro (la operación buscada) o el puntaje es bajo; `yes` con puntaje alto sin
 * fallar precio ni zona; `maybe` en el medio; `unknown` si hay menos de dos criterios evaluables.
 */
export function matchPreferences(prop: PrefProperty, prefs: PrefInput | null | undefined, taste: TasteProfileData | null | undefined): Fit {
  let source: Fit["source"] = "none";
  let criteria: FitCriterion[] = [];

  if (prefs && hasExplicitPreferences(prefs)) {
    source = "explicit";
    criteria = explicitCriteria(prop, prefs);
  } else if (taste && taste.sampleSize >= 5) {
    source = "taste";
    criteria = tasteCriteria(prop, taste);
  }
  if (criteria.length === 0) return { source: "none", criteria: [], ratio: null, verdict: "unknown" };

  const ratio = scoreOf(criteria);
  const usable = criteria.filter((c) => c.result !== "unknown").length;
  if (ratio == null || usable < 2) return { source, criteria, ratio, verdict: "unknown" };

  const hardMiss = source === "explicit" && criteria.some((c) => c.key === "operation" && c.result === "miss");
  const softMiss = criteria.some((c) => (c.key === "price" || c.key === "location") && c.result === "miss");

  let verdict: Fit["verdict"];
  if (hardMiss) verdict = "no";
  else if (ratio >= 0.75 && !softMiss) verdict = "yes";
  else if (ratio >= 0.4) verdict = "maybe";
  else verdict = "no";
  return { source, criteria, ratio, verdict };
}
