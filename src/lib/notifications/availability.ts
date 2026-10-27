import type { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { AvailabilityWatch } from "@/lib/db/models/AvailabilityWatch";
import { Favorite } from "@/lib/db/models/Favorite";
import { todayAr } from "@/lib/availability";
import { createNotificationForMany } from "./create";
import { findInterestedUsers } from "./match-users";

type FreedProperty = {
  _id: Types.ObjectId | string;
  slug: string;
  title: string;
  operation: string;
  type: string;
  price?: { amount: number; currency?: string | null; period?: string | null } | null;
  features?: { rooms?: number | null } | null;
  address?: { neighborhood?: string | null } | null;
};

/**
 * Un alquiler que no estaba disponible volvió a estarlo (la inmobiliaria lo liberó o terminó su último período ocupado).
 * Avisa, sin repetir, a tres grupos con textos distintos: quienes pidieron "avisarme cuando se libere", quienes la guardaron y
 * quienes tienen intereses que coinciden. Una misma persona recibe un solo aviso por propiedad y por día (`dedupeKey`), así un
 * cambio de estado procesado dos veces —o una propiedad que se libera, se ocupa y se libera de nuevo el mismo día— no repite.
 * Nunca lanza: se llama en `after()` y desde la tarea programada.
 */
export async function notifyPropertyAvailable(property: FreedProperty): Promise<void> {
  try {
    await connectDB();
    const id = String(property._id);
    const href = `/propiedades/${property.slug}`;
    const dedupeKey = `avail:${id}:${todayAr()}`;

    const [watches, favorites, interested] = await Promise.all([
      AvailabilityWatch.find({ propertyId: id }).select("userId").limit(5000).lean(),
      Favorite.find({ propertyId: id }).select("userId").limit(5000).lean(),
      findInterestedUsers({
        operation: property.operation,
        type: property.type,
        price: { amount: property.price?.amount ?? 0, currency: property.price?.currency ?? undefined, period: property.price?.period ?? undefined },
        features: { rooms: property.features?.rooms ?? undefined },
        address: { neighborhood: property.address?.neighborhood ?? undefined },
      }),
    ]);

    const watchers = watches.map((w) => String(w.userId));
    const seen = new Set(watchers);
    const savers = favorites.map((f) => String(f.userId)).filter((u) => !seen.has(u));
    savers.forEach((u) => seen.add(u));
    const others = interested.filter((u) => !seen.has(u));

    await createNotificationForMany(watchers, { type: "availability", title: "Se liberó la propiedad que esperabas", body: property.title, href, propertyId: id, dedupeKey });
    await createNotificationForMany(savers, { type: "availability", title: "Una propiedad que guardaste ya está disponible", body: property.title, href, propertyId: id, dedupeKey });
    await createNotificationForMany(others, { type: "availability", title: "Hay un alquiler disponible que coincide con lo que buscás", body: property.title, href, propertyId: id, dedupeKey });

    if (watchers.length > 0) await AvailabilityWatch.updateMany({ propertyId: id, userId: { $in: watchers } }, { $set: { notifiedAt: new Date() } });
  } catch (err) {
    console.error("notifyPropertyAvailable failed:", err);
  }
}
