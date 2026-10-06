import { redirect } from "next/navigation";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { agencyScope, scopeFilter } from "@/lib/auth/agency-scope";
import { connectDB } from "@/lib/db/connect";
import { Lead } from "@/lib/db/models/Lead";
import { Agency } from "@/lib/db/models/Agency";
import { AgencyFilterSelect } from "@/components/dashboard/AgencyFilterSelect";
import { LeadsBoard } from "@/components/dashboard/LeadsBoard";
import { toLeadRow } from "@/lib/leads/serialize";

export const metadata = { title: "Clientes" };

export default async function DashboardLeadsPage({ searchParams }: PageProps<"/dashboard/clientes">) {
  const access = await requireDashboardAccess();
  if (!access) redirect("/ingresar");
  if (access.needsOnboarding) redirect("/publicar");

  const rawAgency = (await searchParams).agencyId;
  const scope = agencyScope(access, Array.isArray(rawAgency) ? rawAgency[0] : rawAgency);
  if (!scope) redirect("/dashboard");

  await connectDB();
  const [docs, agencies] = await Promise.all([
    Lead.find(scopeFilter(scope))
      .sort({ updatedAt: -1 })
      .limit(300)
      .populate({ path: "propertyId", select: "title slug" })
      .lean(),
    access.isAdmin ? Agency.find({}).select("name").sort({ name: 1 }).lean() : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-text">Clientes</h1>
          <p className="text-sm text-text-muted">
            Las personas que consultaron por tus propiedades, ordenadas por etapa. Respondé rápido: los contactos
            sin seguimiento se enfrían.
          </p>
        </div>
        {access.isAdmin && agencies && (
          <AgencyFilterSelect
            agencies={agencies.map((a) => ({ id: String(a._id), name: a.name }))}
            selected={scope.agencyId ?? ""}
            basePath="/dashboard/clientes"
          />
        )}
      </div>
      <LeadsBoard key={scope.agencyId ?? "all"} initialLeads={docs.map(toLeadRow)} />
    </div>
  );
}
