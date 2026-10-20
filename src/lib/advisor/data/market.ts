import { Property } from "@/lib/db/models/Property";
import { memo } from "@/lib/intelligence/cache";
import { buildEntityIndex, type EntityIndex } from "../nlu/entities";

/**
 * Índice de zonas del mercado público (todas las propiedades publicadas), para
 * que el explorador pueda nombrar un barrio o ciudad y el asesor lo reconozca.
 * No incluye títulos: el explorador se refiere a propiedades por lo conversado.
 */
export function loadMarketIndex(): Promise<EntityIndex> {
  return memo("advisor:market-index", 10 * 60_000, async () => {
    const [neighborhoods, cities] = await Promise.all([
      Property.distinct("address.neighborhood", { status: "published" }),
      Property.distinct("address.city", { status: "published" }),
    ]);
    const zones = [...neighborhoods, ...cities].filter((z): z is string => typeof z === "string" && z.trim().length > 1);
    return buildEntityIndex({ zones, properties: [] });
  });
}
