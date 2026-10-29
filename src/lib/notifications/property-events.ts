/**
 * Avisos de lo que cambia en una propiedad y le importa a quien la guardó, le dio me gusta o pidió aviso: baja o suba de precio,
 * que dejó de estar disponible y fotos, video o recorrido nuevos. Cada uno lleva `dedupeKey` (un cambio procesado dos veces no avisa
 * dos veces) y un `tag` de dispositivo por propiedad (los avisos de la misma propiedad se reemplazan en vez de apilarse). Nunca lanzan:
 * se llaman dentro de `after()`.
 */
import type { Types } from "mongoose";
import { weekKey } from "@/lib/intelligence/notify";
import { todayAr } from "@/lib/availability";
import { createNotificationForMany } from "./create";
import { propertyAudience } from "./audience";
import { newMediaMessage, priceChangeMessage, unavailableMessage, type MediaKind, type UnavailableStatus } from "./social-text";

export type PropertyRef = {
  _id: Types.ObjectId | string;
  slug: string;
  title: string;
  operation: string;
  type: string;
  address?: { city?: string | null; neighborhood?: string | null } | null;
};

const tag = (p: PropertyRef): string => `prop:${String(p._id)}`;

/** Bajó o subió el precio (el llamador ya comprobó que la moneda y el período son los mismos). */
export async function notifyPriceChange(
  p: PropertyRef,
  kind: "drop" | "up",
  prev: { amount: number; currency: string },
  next: { amount: number; currency: string },
  period: string | null | undefined
): Promise<void> {
  try {
    const id = String(p._id);
    const msg = priceChangeMessage(kind, p, prev, next, { operation: p.operation, period });
    await createNotificationForMany(await propertyAudience(id), {
      type: msg.type,
      title: msg.title,
      body: msg.body,
      href: msg.href,
      propertyId: id,
      dedupeKey: `price-${kind}:${id}:${next.currency}${next.amount}`,
      pushTag: tag(p),
    });
  } catch (err) {
    console.error("notifyPriceChange failed:", err);
  }
}

/** Se vendió, se alquiló o quedó reservada. */
export async function notifyUnavailable(p: PropertyRef, status: UnavailableStatus): Promise<void> {
  try {
    const id = String(p._id);
    const msg = unavailableMessage({ title: p.title, slug: p.slug, operation: p.operation, type: p.type, city: p.address?.city, neighborhood: p.address?.neighborhood }, status);
    await createNotificationForMany(await propertyAudience(id), {
      type: "unavailable",
      title: msg.title,
      body: msg.body,
      href: msg.href,
      propertyId: id,
      // Con el día: un alquiler se ocupa y se libera varias veces; una venta no (el día no cambia nada).
      dedupeKey: `unavail:${id}:${status}:${todayAr()}`,
      pushTag: tag(p),
    });
  } catch (err) {
    console.error("notifyUnavailable failed:", err);
  }
}

/** Sumó fotos, un video o un recorrido. Como mucho un aviso por semana y propiedad: subir las fotos de a una no llena el teléfono. */
export async function notifyNewMedia(p: PropertyRef, kinds: MediaKind[]): Promise<void> {
  if (kinds.length === 0) return;
  try {
    const id = String(p._id);
    const msg = newMediaMessage(p, kinds);
    await createNotificationForMany(await propertyAudience(id), {
      type: "new_media",
      title: msg.title,
      body: msg.body,
      href: msg.href,
      propertyId: id,
      dedupeKey: `media:${id}:${weekKey()}`,
      pushTag: tag(p),
    });
  } catch (err) {
    console.error("notifyNewMedia failed:", err);
  }
}
