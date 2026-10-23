/**
 * Convierte las entradas de la bitácora (`ActivityLog`) en frases claras:
 * "Bajaste el precio de US$120.000 a US$110.000 (−8,3 %)". Es lo que permite al
 * asesor citar lo que hizo la inmobiliaria con exactitud.
 */
import {
  AMENITY_LABELS,
  OPERATION_LABELS,
  PROPERTY_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
  type Amenity,
  type Operation,
  type PropertyStatus,
  type PropertyType,
} from "@/config/filters";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/leads/status";
import type { ActivityChange } from "@/lib/activity/diff";
import type { ActivityEntry } from "../data/activity";
import type { Tone } from "../types";
import { clip, money, n0, quote } from "./format";

const FEATURE_LABELS: Record<string, string> = {
  rooms: "los ambientes",
  bedrooms: "los dormitorios",
  bathrooms: "los baños",
  garages: "las cocheras",
  coveredArea: "la superficie cubierta",
  totalArea: "la superficie total",
  age: "la antigüedad",
  floor: "el piso",
  orientation: "la orientación",
};

const ADDRESS_LABELS: Record<string, string> = {
  street: "la calle",
  number: "la altura",
  neighborhood: "el barrio",
  city: "la ciudad",
  province: "la provincia",
  showExact: "la visibilidad de la dirección exacta",
};

const AGENCY_LABELS: Record<string, string> = {
  name: "el nombre",
  description: "la descripción",
  whatsapp: "el WhatsApp",
  phone: "el teléfono",
  email: "el email",
  website: "el sitio web",
  city: "la ciudad",
  province: "la provincia",
  logo: "el logo",
  cover: "la portada",
  status: "el estado",
};

const amenityLabel = (raw: string): string => AMENITY_LABELS[raw as Amenity] ?? raw;

function val(v: unknown): string {
  return v == null ? "—" : String(v);
}

/** Una frase por cambio, en segunda persona ("Cambiaste…"). `tone` marca si es algo para tener en cuenta. */
export function describeChange(c: ActivityChange): { text: string; tone: Tone } {
  const before = c.before;
  const after = c.after;
  const unit = c.unit ?? "";
  switch (c.field) {
    case "price": {
      const b = typeof before === "number" ? money(before, unit || "USD") : null;
      const a = typeof after === "number" ? money(after, unit || "USD") : null;
      const dropped = typeof before === "number" && typeof after === "number" && after < before;
      const verb = dropped ? "Bajaste" : typeof before === "number" && typeof after === "number" ? "Subiste" : "Cambiaste";
      return {
        text: `${verb} el precio${b && a ? ` de ${b} a ${a}` : a ? ` a ${a}` : ""}${c.note ? ` (${c.note.replace("-", "−").replace(".", ",")})` : ""}`,
        tone: "neutral",
      };
    }
    case "currency":
      return { text: `Cambiaste la moneda de ${val(before)} a ${val(after)}`, tone: "neutral" };
    case "expenses":
      return { text: `Cambiaste las expensas${typeof after === "number" ? ` a ${money(after, unit || "ARS")}` : ""}`, tone: "neutral" };
    case "price_period":
      return { text: "Cambiaste el período del precio", tone: "neutral" };
    case "status": {
      const to = PROPERTY_STATUS_LABELS[after as PropertyStatus] ?? val(after);
      const from = PROPERTY_STATUS_LABELS[before as PropertyStatus];
      return { text: `Pasaste la propiedad a «${to}»${from ? ` (estaba «${from}»)` : ""}`, tone: after === "published" ? "good" : "neutral" };
    }
    case "title":
      return { text: `Cambiaste el título a ${quote(val(after))}`, tone: "neutral" };
    case "description": {
      const b = typeof before === "number" ? before : 0;
      const a = typeof after === "number" ? after : 0;
      const how = a > b ? `la ampliaste de ${n0(b)} a ${n0(a)} caracteres` : a < b ? `la acortaste de ${n0(b)} a ${n0(a)} caracteres` : "la reescribiste";
      return { text: `Editaste la descripción: ${how}`, tone: a > b ? "good" : "neutral" };
    }
    case "type":
      return { text: `Cambiaste el tipo a ${PROPERTY_TYPE_LABELS[after as PropertyType] ?? val(after)}`, tone: "neutral" };
    case "operation":
      return { text: `Cambiaste la operación a ${OPERATION_LABELS[after as Operation] ?? val(after)}`, tone: "neutral" };
    case "location":
      return { text: c.note ? `Moviste el pin del mapa (${c.note.replace("Pin movido ", "")})` : "Moviste el pin del mapa", tone: "neutral" };
    case "amenities":
      return { text: `Cambiaste las comodidades${c.note ? ` (${c.note.split(", ").map((p) => `${p[0]}${amenityLabel(p.slice(1))}`).join(", ")})` : ""}`, tone: "neutral" };
    case "photos": {
      const diff = typeof before === "number" && typeof after === "number" ? after - before : 0;
      if (diff > 0) return { text: `Sumaste ${diff} ${diff === 1 ? "foto" : "fotos"} (ahora ${after})`, tone: "good" };
      if (diff < 0) return { text: `Quitaste ${-diff} ${diff === -1 ? "foto" : "fotos"} (ahora ${after})`, tone: "neutral" };
      return { text: `Reemplazaste fotos${c.note ? ` (${c.note})` : ""}`, tone: "neutral" };
    }
    case "cover":
      return { text: "Cambiaste la foto de portada", tone: "neutral" };
    case "photos_order":
      return { text: "Reordenaste las fotos", tone: "neutral" };
    case "floorPlans":
      return { text: `Actualizaste los planos${c.note ? ` (${c.note})` : ""}`, tone: "neutral" };
    case "videos": {
      const diff = typeof before === "number" && typeof after === "number" ? after - before : 0;
      return { text: diff > 0 ? `Agregaste ${diff === 1 ? "un video" : `${diff} videos`}` : diff < 0 ? `Quitaste ${diff === -1 ? "un video" : `${-diff} videos`}` : "Cambiaste los videos", tone: diff > 0 ? "good" : "neutral" };
    }
    case "tour360": {
      const diff = typeof before === "number" && typeof after === "number" ? after - before : 0;
      return { text: diff > 0 ? `Sumaste ${diff === 1 ? "una foto 360°" : `${diff} fotos 360°`} (ahora ${after})` : diff < 0 ? `Quitaste ${diff === -1 ? "una foto 360°" : `${-diff} fotos 360°`}` : "Cambiaste el recorrido 360°", tone: diff > 0 ? "good" : "neutral" };
    }
    case "tour360_links":
      return { text: `Editaste los enlaces del recorrido 360° (de ${val(before)} a ${val(after)})`, tone: "neutral" };
    case "virtualTour":
      return { text: after ? "Activaste el recorrido navegable" : "Desactivaste el recorrido navegable", tone: after ? "good" : "neutral" };
    case "ambientCover":
      if (before && after) return { text: "Cambiaste la portada viva por otra", tone: "neutral" };
      return { text: after ? "Activaste la portada viva" : "Quitaste la portada viva", tone: after ? "good" : "neutral" };
    case "agency":
      return { text: c.note ?? "Reasignaron la propiedad a otra inmobiliaria", tone: "neutral" };
    case "youtube":
      return { text: after ? `Vinculaste tu canal de YouTube${c.note ? ` (${clip(c.note, 40)})` : ""}` : "Desvinculaste tu canal de YouTube", tone: after ? "good" : "neutral" };
    case "lead.status": {
      const to = LEAD_STATUS_LABELS[after as LeadStatus] ?? val(after);
      return { text: `Pasaste un cliente a «${to}»`, tone: "neutral" };
    }
    case "lead.note":
      return { text: "Anotaste una nota sobre un cliente", tone: "neutral" };
    case "social.mode":
      return { text: `Pasaste «Contenido para redes» a modo ${after === "auto" ? "automático" : "manual"}`, tone: "neutral" };
  }

  if (c.field.startsWith("address.")) {
    const key = c.field.slice("address.".length);
    return { text: `Cambiaste ${ADDRESS_LABELS[key] ?? key}${before != null || after != null ? ` (${val(before)} → ${val(after)})` : ""}`, tone: "neutral" };
  }
  if (c.field.startsWith("features.")) {
    const key = c.field.slice("features.".length);
    return { text: `Cambiaste ${FEATURE_LABELS[key] ?? key} (${val(before)} → ${val(after)})`, tone: "neutral" };
  }
  if (c.field.startsWith("agency.")) {
    const key = c.field.slice("agency.".length);
    return { text: `Cambiaste ${AGENCY_LABELS[key] ?? key} de tu perfil${c.note && key !== "description" ? ` (${c.note})` : ""}`, tone: "neutral" };
  }
  return { text: `Cambiaste ${c.field}`, tone: "neutral" };
}

/** Título y detalle de una entrada completa (puede traer varios cambios). */
export function describeEntry(entry: ActivityEntry): { title: string; detail?: string; tone: Tone } {
  const who = entry.actorRole === "admin" ? "El administrador: " : "";
  const name = entry.propertyTitle ? quote(entry.propertyTitle) : "";

  switch (entry.kind) {
    case "property_created":
      return { title: `${who}Creaste ${name}`.trim(), tone: "good" };
    case "property_deleted":
      return { title: `${who}Eliminaste ${name}`.trim(), tone: "neutral" };
    case "agency_created":
      return { title: `${who}Se creó la inmobiliaria`, tone: "good" };
    case "property_updated": {
      const parts = entry.changes.map(describeChange);
      const first = parts[0];
      if (!first) return { title: `${who}Editaste ${name}`.trim(), tone: "neutral" };
      const rest = parts.slice(1).map((p) => p.text.charAt(0).toLowerCase() + p.text.slice(1));
      return {
        title: `${who}${first.text} en ${name}`.trim(),
        detail: rest.length > 0 ? `Además: ${rest.join("; ")}.` : undefined,
        tone: first.tone,
      };
    }
    default: {
      const parts = entry.changes.map(describeChange);
      const first = parts[0];
      const suffix = name ? ` (${name})` : "";
      return { title: `${who}${first ? first.text : "Cambio en tu inmobiliaria"}${suffix}`, tone: first?.tone ?? "neutral" };
    }
  }
}
