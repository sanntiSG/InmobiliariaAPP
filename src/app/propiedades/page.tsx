import type { Metadata } from "next";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { parseFilters } from "@/lib/filters/state";
import PropiedadesClient from "./PropiedadesClient";

export const metadata: Metadata = { title: "Propiedades" };

/**
 * El listado de propiedades. Los filtros viajan en la dirección (`/propiedades?type=casa&operation=venta`): el servidor los lee
 * para abrir ya filtrado —por ejemplo desde el botón "Lista" del mapa— y, si se filtra por una inmobiliaria, comprueba que esté
 * activa y trae su nombre para mostrarlo.
 */
export default async function PropiedadesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseFilters(await searchParams);

  let agencyName: string | null = null;
  if (filters.agencyId) {
    try {
      await connectDB();
      agencyName = (await Agency.findOne({ _id: filters.agencyId, status: "active" }).select("name").lean())?.name ?? null;
    } catch (err) {
      console.error("PropiedadesPage agency lookup failed:", (err as Error)?.message);
    }
    // Una inmobiliaria que no existe o no está activa no filtra (mostraría una lista vacía sin explicación).
    if (!agencyName) filters.agencyId = null;
  }

  return <PropiedadesClient initialFilters={filters} agencyName={agencyName} />;
}
