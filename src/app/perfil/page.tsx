import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db/connect";
import { Favorite } from "@/lib/db/models/Favorite";
import { PROPERTY_CARD_PROJECTION } from "@/lib/db/property-query";
import { toPropertyCardData } from "@/lib/db/property-card-mapper";
import { Navbar } from "@/components/layout/Navbar";
import { FavoritesGrid } from "@/components/property/FavoritesGrid";
import type { PropertyCardData } from "@/components/property/types";

export const metadata = { title: "Mi perfil" };

export default async function PerfilPage() {
  const session = await auth().catch(() => null);
  if (!session?.user) redirect("/ingresar");

  await connectDB();
  const favoriteDocs = await Favorite.find({ userId: session.user.id })
    .populate({
      path: "propertyId",
      select: PROPERTY_CARD_PROJECTION,
      populate: { path: "agencyId", select: "name" },
    })
    .sort({ createdAt: -1 })
    .lean();

  const favorites: PropertyCardData[] = favoriteDocs
    .filter((f) => f.propertyId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((f) => toPropertyCardData(f.propertyId as any));

  const initial = session.user.name?.charAt(0).toUpperCase() ?? "U";

  return (
    <div className="min-h-dvh">
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft font-display text-xl font-bold text-accent">
            {initial}
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-text">{session.user.name}</h1>
            <p className="text-sm text-text-muted">{session.user.email}</p>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="font-display text-lg font-semibold text-text">
            Mis favoritos {favorites.length > 0 && <span className="text-text-muted">({favorites.length})</span>}
          </h2>

          {favorites.length === 0 ? (
            <p className="mt-3 text-sm text-text-muted">
              Todavía no guardaste ninguna propiedad. Guardá las que te interesen desde el mapa o el listado.
            </p>
          ) : (
            <div className="mt-4">
              <FavoritesGrid favorites={favorites} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
