import { redirect } from "next/navigation";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { agencyScope } from "@/lib/auth/agency-scope";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { getIntelligence } from "@/lib/intelligence/opportunities";
import { OpportunitiesBoard } from "@/components/dashboard/OpportunitiesBoard";
import { AgencyFilterSelect } from "@/components/dashboard/AgencyFilterSelect";

export const metadata = { title: "Oportunidades" };

export default async function OpportunitiesPage({ searchParams }: PageProps<"/dashboard/oportunidades">) {
  const access = await requireDashboardAccess();
  if (!access) redirect("/ingresar");

  const rawAgency = (await searchParams).agencyId;
  const scope = agencyScope(access, Array.isArray(rawAgency) ? rawAgency[0] : rawAgency);
  if (!scope) redirect("/");

  await connectDB();
  const [intel, agencies] = await Promise.all([
    getIntelligence(scope.agencyId),
    access.isAdmin ? Agency.find({}).select("name").sort({ name: 1 }).lean() : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-text">Centro de oportunidades</h1>
          <p className="max-w-2xl text-sm text-text-muted">
            El sistema revisa los números reales de tus propiedades y te cuenta qué está pasando, por qué, y qué podrías
            hacer. Se actualiza solo con cada visita, favorito y consulta.
          </p>
        </div>
        {access.isAdmin && agencies && (
          <AgencyFilterSelect
            agencies={agencies.map((a) => ({ id: String(a._id), name: a.name }))}
            selected={scope.agencyId ?? ""}
            basePath="/dashboard/oportunidades"
          />
        )}
      </div>
      <OpportunitiesBoard key={scope.agencyId ?? "all"} items={intel.opportunities} />
    </div>
  );
}
