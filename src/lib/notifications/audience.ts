import { connectDB } from "@/lib/db/connect";
import { AvailabilityWatch } from "@/lib/db/models/AvailabilityWatch";
import { Favorite } from "@/lib/db/models/Favorite";
import { Like } from "@/lib/db/models/Like";

/** Tope por lista: una propiedad muy popular no tiene que trabar la respuesta que generó el aviso. */
const LIMIT = 5000;

/**
 * A quién le importa una propiedad: quienes la guardaron, le dieron me gusta o pidieron que les avisen cuando se libere. Sin repetidos.
 * Es el público de los cambios que les afectan (precio, ya no disponible, fotos nuevas).
 */
export async function propertyAudience(propertyId: string): Promise<string[]> {
  await connectDB();
  const [favorites, likes, watches] = await Promise.all([
    Favorite.find({ propertyId }).select("userId").limit(LIMIT).lean(),
    Like.find({ propertyId }).select("userId").limit(LIMIT).lean(),
    AvailabilityWatch.find({ propertyId }).select("userId").limit(LIMIT).lean(),
  ]);
  return [...new Set([...favorites, ...likes, ...watches].map((d) => String(d.userId)))];
}
