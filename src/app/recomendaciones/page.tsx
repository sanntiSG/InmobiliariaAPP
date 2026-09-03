import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db/connect";
import { getRecommendedProperties } from "@/lib/recommendations/engine";
import { Navbar } from "@/components/layout/Navbar";
import { PropertyGrid } from "@/components/property/PropertyGrid";

export const metadata = { title: "Recomendado para vos" };

export default async function RecomendacionesPage() {
  const session = await auth().catch(() => null);
  if (!session?.user) redirect("/ingresar");

  await connectDB();
  const recommendations = await getRecommendedProperties(session.user.id, 16);

  return (
    <div className="min-h-dvh">
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="font-display text-2xl font-bold text-text">Recomendado para vos</h1>
        <p className="mt-1 text-text-muted">
          Basado en tus preferencias y tu actividad reciente.{" "}
          <Link href="/perfil" className="font-medium text-accent hover:underline">
            Ajustar preferencias
          </Link>
        </p>

        {recommendations.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-2 py-16 text-center text-text-muted">
            <p className="font-display text-lg font-semibold text-text">Todavía no tenemos recomendaciones</p>
            <p className="max-w-sm text-sm">
              Explorá algunas propiedades o contanos tus preferencias para empezar a personalizar tu experiencia.
            </p>
            <Link href="/mapa" className="mt-2 font-medium text-accent hover:underline">
              Ir al mapa
            </Link>
          </div>
        ) : (
          <div className="mt-6">
            <PropertyGrid properties={recommendations} />
          </div>
        )}
      </div>
    </div>
  );
}
