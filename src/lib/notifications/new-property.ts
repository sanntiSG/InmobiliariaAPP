import type { Types } from "mongoose";
import { Agency } from "@/lib/db/models/Agency";
import { AgencyFollow } from "@/lib/db/models/AgencyFollow";
import { connectDB } from "@/lib/db/connect";
import { createNotificationForMany } from "./create";
import { findInterestedUsers } from "./match-users";

type PublishedProperty = {
  _id: Types.ObjectId | string;
  agencyId: Types.ObjectId | string;
  slug: string;
  title: string;
  operation: string;
  type: string;
  price?: { amount: number; currency?: string | null } | null;
  features?: { rooms?: number | null } | null;
  address?: { neighborhood?: string | null } | null;
};

/**
 * Avisos al publicar una propiedad por primera vez:
 * 1. quienes siguen a la inmobiliaria ("X publicó una propiedad nueva"),
 * 2. quienes tienen gustos o preferencias que coinciden ("Nueva propiedad para vos").
 * Un seguidor que además coincide recibe sólo el primero, no dos avisos.
 * Nunca lanza: se llama en `after()` y un fallo no debe afectar a quien publicó.
 */
export async function notifyNewPublication(property: PublishedProperty): Promise<void> {
  try {
    await connectDB();
    const id = String(property._id);
    const href = `/propiedades/${property.slug}`;

    const [follows, agency, interested] = await Promise.all([
      AgencyFollow.find({ agencyId: property.agencyId }).select("userId").limit(5000).lean(),
      Agency.findById(property.agencyId).select("name").lean(),
      findInterestedUsers({
        operation: property.operation,
        type: property.type,
        price: { amount: property.price?.amount ?? 0, currency: property.price?.currency ?? undefined },
        features: { rooms: property.features?.rooms ?? undefined },
        address: { neighborhood: property.address?.neighborhood ?? undefined },
      }),
    ]);

    const followerIds = follows.map((f) => String(f.userId));
    const followerSet = new Set(followerIds);

    await createNotificationForMany(followerIds, {
      type: "follow_new_property",
      title: `${agency?.name ?? "Una inmobiliaria que seguís"} publicó una propiedad nueva`,
      body: property.title,
      href,
      propertyId: id,
      dedupeKey: `follow:${id}`,
    });
    await createNotificationForMany(
      interested.filter((u) => !followerSet.has(u)),
      {
        type: "new_match",
        title: "Nueva propiedad para vos",
        body: property.title,
        href,
        propertyId: id,
        dedupeKey: `new_match:${id}`,
      }
    );
  } catch (err) {
    console.error("notifyNewPublication failed:", err);
  }
}
