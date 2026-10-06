import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { agencyScope } from "@/lib/auth/agency-scope";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { AgencyFilterSelect } from "@/components/dashboard/AgencyFilterSelect";
import { AgencyProfileForm } from "@/components/dashboard/AgencyProfileForm";
import { YouTubeChannelCard } from "@/components/dashboard/YouTubeChannelCard";
import { buttonClasses } from "@/components/ui/Button";

export const metadata = { title: "Mi inmobiliaria" };

export default async function MyAgencyPage({ searchParams }: PageProps<"/dashboard/inmobiliaria">) {
  const access = await requireDashboardAccess();
  if (!access) redirect("/ingresar");

  const rawAgency = (await searchParams).agencyId;
  const scope = agencyScope(access, Array.isArray(rawAgency) ? rawAgency[0] : rawAgency);
  if (!scope) redirect("/");

  await connectDB();
  const agencies = access.isAdmin ? await Agency.find({}).select("name").sort({ name: 1 }).lean() : null;
  const agency = scope.agencyId ? await Agency.findById(scope.agencyId).lean() : null;

  // El admin sin inmobiliaria elegida: primero tiene que elegir cuál editar.
  if (!agency) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-bold text-text">Perfil de la inmobiliaria</h1>
        <div className="rounded-card bg-surface p-8 shadow-card">
          <p className="mb-4 text-sm text-text-muted">Elegí la inmobiliaria cuyo perfil querés editar.</p>
          {agencies && (
            <AgencyFilterSelect
              agencies={agencies.map((a) => ({ id: String(a._id), name: a.name }))}
              selected=""
              basePath="/dashboard/inmobiliaria"
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-text">Perfil de la inmobiliaria</h1>
          <p className="max-w-xl text-sm text-text-muted">
            Es tu espacio de presentación dentro de la plataforma: lo ven quienes llegan desde una propiedad o desde el mapa.
            {` ${agency.stats?.followers ?? 0} ${agency.stats?.followers === 1 ? "persona te sigue" : "personas te siguen"}.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {access.isAdmin && agencies && (
            <AgencyFilterSelect
              agencies={agencies.map((a) => ({ id: String(a._id), name: a.name }))}
              selected={String(agency._id)}
              basePath="/dashboard/inmobiliaria"
            />
          )}
          <Link href={`/inmobiliarias/${agency.slug}`} className={buttonClasses("secondary", "md", "inline-flex items-center gap-1.5")}>
            Ver perfil público <ExternalLink className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>

      <AgencyProfileForm
        key={String(agency._id)}
        agencyId={access.isAdmin ? String(agency._id) : undefined}
        initialValues={{
          name: agency.name,
          description: agency.description ?? "",
          whatsapp: agency.contact?.whatsapp ?? "",
          phone: agency.contact?.phone ?? "",
          email: agency.contact?.email ?? "",
          website: agency.contact?.website ?? "",
          city: agency.address?.city ?? "",
          province: agency.address?.province ?? "",
          logo: agency.logo ?? "",
          cover: agency.cover ?? "",
        }}
      />

      <YouTubeChannelCard
        key={`yt-${String(agency._id)}`}
        agencyId={access.isAdmin ? String(agency._id) : undefined}
        initialChannelTitle={agency.youtube?.channelId ? (agency.youtube.channelTitle ?? "Canal vinculado") : null}
      />
    </div>
  );
}
