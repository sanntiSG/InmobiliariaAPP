import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { Property } from "@/lib/db/models/Property";
import { auth } from "@/auth";
import { getFreshAccount } from "@/lib/auth/fresh-account";
import { resolvePanelLink } from "@/lib/auth/panel-link";
import MapaClient, { type MapAgencyFilter } from "@/components/map/MapaClient";

export const metadata = { title: "Mapa" };

/**
 * El mapa es una pantalla de cliente; esta página sólo resuelve en el servidor
 * el filtro `?agency=<id>` (botón "Ver en mapa" del perfil de una
 * inmobiliaria): valida el id, trae su nombre y el rectángulo que abarcan sus
 * propiedades para encuadrar el mapa ahí.
 */
export default async function MapaPage({ searchParams }: PageProps<"/mapa">) {
  const raw = (await searchParams).agency;
  const agencyId = Array.isArray(raw) ? raw[0] : raw;

  let agency: MapAgencyFilter | null = null;
  if (agencyId && Types.ObjectId.isValid(agencyId)) {
    try {
      await connectDB();
      const found = await Agency.findOne({ _id: agencyId, status: "active" }).select("name").lean();
      if (found) {
        const [extent] = await Property.aggregate([
          { $match: { agencyId: new Types.ObjectId(agencyId), status: "published" } },
          {
            $group: {
              _id: null,
              west: { $min: { $arrayElemAt: ["$location.coordinates", 0] } },
              east: { $max: { $arrayElemAt: ["$location.coordinates", 0] } },
              south: { $min: { $arrayElemAt: ["$location.coordinates", 1] } },
              north: { $max: { $arrayElemAt: ["$location.coordinates", 1] } },
            },
          },
        ]);
        agency = {
          id: agencyId,
          name: found.name,
          bbox: extent ? { west: extent.west, south: extent.south, east: extent.east, north: extent.north } : null,
        };
      }
    } catch (err) {
      // Sin base de datos el mapa igual abre (sin filtro): mejor eso que una pantalla de error.
      console.error("MapaPage agency lookup failed:", err);
    }
  }

  // Atajo al panel: sale de la BASE (no de la cookie), igual que el hero.
  const session = await auth().catch(() => null);
  const account = session?.user?.id ? await getFreshAccount(session.user.id) : null;

  return <MapaClient agency={agency} panelLink={resolvePanelLink(account)} />;
}
