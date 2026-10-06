import { User } from "@/lib/db/models/User";
import { UserTasteProfile } from "@/lib/db/models/UserTasteProfile";
import { priceKey } from "@/lib/intelligence/user-profile";

type PropertyLike = {
  operation: string;
  type: string;
  price: { amount: number; currency?: string };
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

/**
 * Usuarios a los que les puede interesar por lo que HACEN (perfil de gustos):
 * su zona y tipo habituales, y un precio dentro del rango que suelen mirar.
 * Complementa a `findMatchingUsers`, que sólo mira preferencias declaradas.
 */
export async function findUsersByTaste(property: PropertyLike, limit = 200): Promise<string[]> {
  const neighborhood = property.address?.neighborhood;
  if (!neighborhood) return [];

  const profiles = await UserTasteProfile.find({
    topNeighborhoods: neighborhood,
    topTypes: property.type,
    topOperations: property.operation,
    sampleSize: { $gte: 2 },
  })
    .select("userId prices")
    .limit(limit)
    .lean();

  const key = priceKey(property.operation, property.price.currency ?? "USD");
  const fits = profiles.filter((p) => {
    const band = p.prices.find((b) => b.key === key);
    return !band || (property.price.amount >= band.low! * 0.8 && property.price.amount <= band.high! * 1.2);
  });
  if (fits.length === 0) return [];

  // Sólo explorador: las cuentas de inmobiliaria no reciben avisos de "para vos".
  const users = await User.find({ _id: { $in: fits.map((p) => p.userId) }, role: "user" }).select("_id").lean();
  return users.map((u) => String(u._id));
}

/** Unión (sin repetir) de quienes matchean por preferencias declaradas y por gustos reales. */
export async function findInterestedUsers(property: PropertyLike): Promise<string[]> {
  const [declared, taste] = await Promise.all([findMatchingUsers(property), findUsersByTaste(property)]);
  return [...new Set([...declared, ...taste])];
}
