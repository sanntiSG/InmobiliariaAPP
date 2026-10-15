import { connectDB } from "@/lib/db/connect";
import { Agency, Property } from "@/lib/db/models";
import { memo } from "@/lib/intelligence/cache";

export type HeroStats = { properties: number; tours: number; agencies: number };

/** Cifras de la prueba social del hero. Cacheadas 10 min; `null` si la base no responde. */
export function getHeroStats(): Promise<HeroStats | null> {
  return memo("hero-stats", 10 * 60_000, async () => {
    await connectDB();
    const [properties, tours, agencies] = await Promise.all([
      Property.countDocuments({ status: "published" }),
      Property.countDocuments({ status: "published", "media.hasTour3d": true }),
      Agency.countDocuments({ status: "active" }),
    ]);
    return { properties, tours, agencies };
  }).catch(() => null);
}
