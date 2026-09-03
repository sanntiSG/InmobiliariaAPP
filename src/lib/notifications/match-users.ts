import { User } from "@/lib/db/models/User";

type PropertyLike = {
  operation: string;
  type: string;
  price: { amount: number };
  features?: { rooms?: number };
  address?: { neighborhood?: string };
};

/**
 * Usuarios cuyas preferencias explícitas matchean una propiedad nueva —
 * usado para la notificación "new_match". Solo considera usuarios que
 * configuraron al menos operación o tipo (evita spamear a todos).
 */
export async function findMatchingUsers(property: PropertyLike, limit = 200): Promise<string[]> {
  const candidates = await User.find({
    role: "user",
    $or: [{ "preferences.operations": property.operation }, { "preferences.propertyTypes": property.type }],
  })
    .select("_id preferences")
    .limit(limit)
    .lean();

  return candidates
    .filter((u) => {
      const p = u.preferences;
      if (!p) return false;

      const opMatch = !p.operations?.length || p.operations.includes(property.operation);
      const typeMatch = !p.propertyTypes?.length || p.propertyTypes.includes(property.type);
      const priceMatch =
        (p.priceMin == null || property.price.amount >= p.priceMin) &&
        (p.priceMax == null || property.price.amount <= p.priceMax);
      const roomsMatch = !p.minRooms || (property.features?.rooms != null && property.features.rooms >= p.minRooms);
      const neighborhood = property.address?.neighborhood?.toLowerCase();
      const locationMatch =
        !p.locations?.length || (!!neighborhood && p.locations.some((l) => neighborhood.includes(l.toLowerCase())));

      return opMatch && typeMatch && priceMatch && roomsMatch && locationMatch;
    })
    .map((u) => String(u._id));
}
