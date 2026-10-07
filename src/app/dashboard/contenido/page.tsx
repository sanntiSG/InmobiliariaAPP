import { redirect } from "next/navigation";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { agencyScope } from "@/lib/auth/agency-scope";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { AgencyFilterSelect } from "@/components/dashboard/AgencyFilterSelect";
import { SocialStudio } from "@/components/dashboard/social/SocialStudio";
import { getState } from "@/lib/social/engine";

export const metadata = { title: "Contenido para redes" };

export default async function SocialContentPage({ searchParams }: PageProps<"/dashboard/contenido">) {
  const access = await requireDashboardAccess();
  if (!access) redirect("/ingresar");
  if (access.needsOnboarding) redirect("/publicar");

  const rawAgency = (await searchParams).agencyId;
  const scope = agencyScope(access, Array.isArray(rawAgency) ? rawAgency[0] : rawAgency);
  if (!scope) redirect("/dashboard");

  await connectDB();
  const agencies = access.isAdmin ? await Agency.find({}).select("name").sort({ name: 1 }).lean() : null;
  const state = scope.agencyId ? await getState(scope.agencyId, access.isAdmin) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-text">Contenido para redes</h1>
          <p className="text-sm text-text-muted">
            Publicaciones listas para compartir, armadas con las fotos y los datos de tus propiedades.
          </p>
        </div>
        {access.isAdmin && agencies && (
          <AgencyFilterSelect
            agencies={agencies.map((a) => ({ id: String(a._id), name: a.name }))}
            selected={scope.agencyId ?? ""}
            basePath="/dashboard/contenido"
          />
        )}
      </div>
      {state && scope.agencyId ? (
        <SocialStudio
          key={scope.agencyId}
          agencyId={access.isAdmin ? scope.agencyId : null}
          initial={state}
        />
      ) : (
        <p className="rounded-card bg-surface p-6 text-sm text-text-muted shadow-card">
          Elegí una inmobiliaria para ver su contenido.
        </p>
      )}
    </div>
  );
}
