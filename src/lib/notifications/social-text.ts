/**
 * Los textos, claves anti-repetición y enlaces de los avisos de actividad social (para la inmobiliaria) y de cambios en una propiedad
 * (para quien la guardó, le dio me gusta o pidió aviso). Módulo puro: sin base de datos ni red, lo prueba `push:check`.
 * Reglas: nunca nombran a quien actuó (la inmobiliaria no necesita saber quién guardó qué, y la pantalla bloqueada queda limpia);
 * cada clave `dedupeKey` está pensada para que dar y quitar un me gusta, o repetir una acción, avise una sola vez.
 */
import { formatPrice } from "@/lib/utils/format";
import { periodSuffix } from "@/config/pricing";

export type SocialEvent = "follower" | "like" | "save" | "share" | "rating" | "property_comment";

const clip = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);
const titleOf = (t: string): string => `«${clip(t.trim() || "tu propiedad", 70)}»`;

export type SocialInput = {
  event: SocialEvent;
  propertyId?: string;
  propertyTitle?: string;
  /** Sólo `rating` (1 a 5). */
  stars?: number;
  /** Sólo `property_comment`: el texto (los comentarios ya son públicos en la ficha). */
  text?: string;
};

/** Título, texto y enlace del aviso para la inmobiliaria. */
export function socialMessage(i: SocialInput): { title: string; body: string; href: string } {
  const prop = titleOf(i.propertyTitle ?? "");
  const stats = i.propertyId ? `/dashboard/propiedades/${i.propertyId}/estadisticas` : "/dashboard";
  switch (i.event) {
    case "like":
      return { title: "Nuevo me gusta", body: `A alguien le gustó ${prop}.`, href: stats };
    case "save":
      return { title: "Propiedad guardada", body: `Alguien guardó ${prop}.`, href: stats };
    case "share":
      return { title: "Propiedad compartida", body: `Alguien compartió ${prop}.`, href: stats };
    case "rating": {
      const n = Math.min(5, Math.max(1, Math.round(i.stars ?? 5)));
      return { title: "Nuevo puntaje", body: `Puntuaron ${prop} con ${n} ${n === 1 ? "estrella" : "estrellas"}.`, href: stats };
    }
    case "property_comment": {
      const text = (i.text ?? "").replace(/\s+/g, " ").trim();
      return { title: "Nuevo comentario", body: text ? `En ${prop}: ${clip(text, 100)}` : `Comentaron en ${prop}.`, href: stats };
    }
    case "follower":
      return { title: "Nuevo seguidor", body: "Alguien empezó a seguir a la inmobiliaria.", href: "/dashboard" };
  }
}

/** Año, mes, día y hora UTC (`2026-10-28T14`): `compartir` avisa como máximo una vez por propiedad y por hora. */
export const hourKey = (d: Date = new Date()): string => d.toISOString().slice(0, 13);

/**
 * La clave anti-repetición de cada evento. `actor` es el usuario que actuó (me gusta, guardado, puntaje, seguidor); en `share`
 * (anónimo y fácil de falsear) no cuenta quién: una sola vez por hora y propiedad. Nunca lleva datos personales.
 */
export function socialDedupeKey(i: { event: SocialEvent; propertyId?: string; agencyId?: string; actor?: string | null; commentId?: string; now?: Date }): string {
  switch (i.event) {
    case "like":
    case "save":
    case "rating":
      return `${i.event}:${i.propertyId}:${i.actor ?? "anon"}`;
    case "share":
      return `share:${i.propertyId}:${hourKey(i.now)}`;
    case "property_comment":
      return `comment:${i.commentId ?? `${i.propertyId}:${i.actor ?? "anon"}`}`;
    case "follower":
      return `follow:${i.agencyId}:${i.actor ?? "anon"}`;
  }
}

/** En el dispositivo, los avisos de lo mismo se reemplazan entre sí (la campana igual guarda cada uno). */
export const socialPushTag = (i: { event: SocialEvent; propertyId?: string; agencyId?: string }): string =>
  i.event === "follower" ? `social:${i.agencyId}` : `social:${i.propertyId}`;

// ── Cambios en una propiedad (para quien la guardó, le dio me gusta o pidió aviso) ─────────────────────────────────────────

type PricePoint = { amount: number; currency: string };
type PriceCtx = { operation: string; period?: string | null };

const priceText = (p: PricePoint, ctx: PriceCtx): string => `${formatPrice(p.amount, p.currency)}${periodSuffix(ctx.operation, ctx.period)}`;

/** Baja o suba de precio: sólo se compara dentro de la misma moneda y el mismo período (lo decide quien llama). */
export function priceChangeMessage(kind: "drop" | "up", p: { title: string; slug: string }, prev: PricePoint, next: PricePoint, ctx: PriceCtx) {
  const verb = kind === "drop" ? "Bajó" : "Subió";
  return {
    type: kind === "drop" ? ("price_drop" as const) : ("price_up" as const),
    title: `${verb} el precio de una propiedad que te interesa`,
    body: `${clip(p.title, 80)} · de ${priceText(prev, ctx)} a ${priceText(next, ctx)}`,
    href: `/propiedades/${p.slug}`,
  };
}

export type UnavailableStatus = "sold" | "rented" | "reserved";

const UNAVAILABLE_TEXT: Record<UnavailableStatus, string> = {
  sold: "Se vendió",
  rented: "Se alquiló",
  reserved: "Quedó reservada",
};

/**
 * Una propiedad que le interesaba dejó de estar disponible. Una venta ya no se puede abrir (la ficha de una propiedad no publicada
 * da "no encontrada" a los exploradores), así que el enlace lleva a otras parecidas; un alquiler sigue visible (en rojo) y enlaza a la ficha.
 */
export function unavailableMessage(
  p: { title: string; slug: string; operation: string; type: string; city?: string | null; neighborhood?: string | null },
  status: UnavailableStatus
) {
  const rental = p.operation === "alquiler" || p.operation === "alquiler_temporal";
  const q = new URLSearchParams({ operation: p.operation, type: p.type });
  if (p.neighborhood) q.set("neighborhood", p.neighborhood);
  else if (p.city) q.set("city", p.city);
  return {
    title: `${UNAVAILABLE_TEXT[status]} una propiedad que te interesaba`,
    body: rental ? clip(p.title, 90) : `${clip(p.title, 70)} · Mirá otras parecidas.`,
    href: rental ? `/propiedades/${p.slug}` : `/propiedades?${q.toString()}`,
  };
}

export type MediaKind = "photos" | "video" | "tour";
export type MediaFingerprint = { photos: string[]; videos: string[]; tours: string[] };

type MediaLike = {
  images?: { url?: string | null; providerId?: string | null }[] | null;
  videos?: { url?: string | null; videoId?: string | null }[] | null;
  tours?: { id?: string | null; photo360Url?: string | null }[] | null;
};

/** Qué fotos, videos y recorridos tiene hoy una propiedad, como claves comparables (sin guardar nada más). */
export function mediaFingerprint(media: MediaLike | null | undefined): MediaFingerprint {
  const keys = (list: (string | null | undefined)[] | null | undefined): string[] => (list ?? []).filter((x): x is string => !!x);
  return {
    photos: keys((media?.images ?? []).map((i) => i.providerId ?? i.url)),
    videos: keys((media?.videos ?? []).map((v) => v.videoId ?? v.url)),
    tours: keys((media?.tours ?? []).map((t) => t.id ?? t.photo360Url)),
  };
}

/** Qué se SUMÓ (quitar una foto no avisa a nadie). */
export function newMediaKinds(before: MediaFingerprint, after: MediaFingerprint): MediaKind[] {
  const added = (b: string[], a: string[]): boolean => a.some((k) => !b.includes(k));
  return [
    ...(added(before.photos, after.photos) ? (["photos"] as const) : []),
    ...(added(before.videos, after.videos) ? (["video"] as const) : []),
    ...(added(before.tours, after.tours) ? (["tour"] as const) : []),
  ];
}

const MEDIA_TEXT: Record<MediaKind, string> = { photos: "fotos nuevas", video: "un video nuevo", tour: "un recorrido nuevo" };

export function newMediaMessage(p: { title: string; slug: string }, kinds: MediaKind[]) {
  const parts = kinds.map((k) => MEDIA_TEXT[k]);
  const what = parts.length <= 1 ? (parts[0] ?? "novedades") : `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
  return {
    title: "Una propiedad que te interesa tiene novedades",
    body: `${clip(p.title, 80)} · Sumó ${what}.`,
    href: `/propiedades/${p.slug}`,
  };
}
