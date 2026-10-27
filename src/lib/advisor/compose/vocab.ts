/** Vocabulario de redacción de tipos de propiedad, operaciones y comodidades (género y plural correctos). */
import { AMENITY_LABELS, PROPERTY_TYPE_LABELS, type Amenity, type Operation, type PropertyType } from "@/config/filters";
import type { Slots } from "../types";
import { list, money } from "./format";

const TYPE_INFO: Record<string, { sg: string; pl: string; f: boolean }> = {
  casa: { sg: "casa", pl: "casas", f: true },
  departamento: { sg: "departamento", pl: "departamentos", f: false },
  duplex: { sg: "dúplex", pl: "dúplex", f: false },
  ph: { sg: "PH", pl: "PH", f: false },
  terreno: { sg: "terreno", pl: "terrenos", f: false },
  local: { sg: "local", pl: "locales", f: false },
  oficina: { sg: "oficina", pl: "oficinas", f: true },
  galpon: { sg: "galpón", pl: "galpones", f: false },
  quinta: { sg: "quinta", pl: "quintas", f: true },
};

/** "casas", "departamentos", "locales" (plural correcto) o el singular con `many = false`. */
export const typeLabel = (type: string, many = true): string => {
  const info = TYPE_INFO[type];
  if (info) return many ? info.pl : info.sg;
  return (PROPERTY_TYPE_LABELS[type as PropertyType] ?? type).toLowerCase();
};

/** Artículo y "cada uno/una" según el género del tipo ("las casas", "los departamentos"). */
export const typeGender = (type: string): { the: string; each: string } =>
  TYPE_INFO[type]?.f ? { the: "las", each: "cada una" } : { the: "los", each: "cada uno" };

const OPERATION_TEXT: Record<Operation, string> = {
  venta: "en venta",
  alquiler: "en alquiler",
  alquiler_temporal: "en alquiler temporal",
};

export const operationText = (op: Operation): string => OPERATION_TEXT[op];

/** "Departamentos de 2 ambientes en venta en Palermo, hasta US$120.000, con cochera". */
export function describeSearch(slots: Slots): string {
  const noun = slots.types?.length ? slots.types.map((t) => typeLabel(t)).join(" y ") : "propiedades";
  const parts = [noun.charAt(0).toUpperCase() + noun.slice(1)];
  if (slots.rooms != null) parts[0] += ` de ${slots.rooms} ${slots.rooms === 1 ? "ambiente" : "ambientes"}`;
  if (slots.operation) parts[0] += ` ${operationText(slots.operation)}`;
  if (slots.zones?.length) parts[0] += ` en ${list(slots.zones)}`;
  const extras: string[] = [];
  if (slots.priceMax) extras.push(`hasta ${money(slots.priceMax.amount, slots.priceMax.currency ?? defaultCurrency(slots))}`);
  if (slots.priceMin) extras.push(`desde ${money(slots.priceMin.amount, slots.priceMin.currency ?? defaultCurrency(slots))}`);
  const withs = [
    ...(slots.amenities ?? []).map((a) => (AMENITY_LABELS[a as Amenity] ?? a).toLowerCase()),
    ...(slots.withTour ? ["recorrido 360°"] : []),
    ...(slots.withAmbient ? ["portada viva"] : []),
  ];
  if (withs.length > 0) extras.push(`con ${list(withs)}`);
  return [parts[0], ...extras].join(" ");
}

const defaultCurrency = (slots: Slots): string =>
  slots.operation === "alquiler" || slots.operation === "alquiler_temporal" ? "ARS" : "USD";

/** Cuántos criterios distintos trae la búsqueda. */
export function filterCount(s: Slots): number {
  return (
    (s.zones?.length ? 1 : 0) +
    (s.types?.length ? 1 : 0) +
    (s.operation ? 1 : 0) +
    (s.amenities?.length ? 1 : 0) +
    (s.priceMax || s.priceMin ? 1 : 0) +
    (s.rooms != null || s.bedrooms != null ? 1 : 0) +
    (s.withTour ? 1 : 0) +
    (s.withAmbient ? 1 : 0)
  );
}
