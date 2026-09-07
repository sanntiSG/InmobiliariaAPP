import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, ArrowRight } from "lucide-react";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { connectDB } from "@/lib/db/connect";
import { Property } from "@/lib/db/models/Property";
import { getAgencyWeeklyStats, getAgencyRecommendations } from "@/lib/analytics/agency-stats";
import { StatTile } from "@/components/dashboard/StatTile";
import { RecommendationsList } from "@/components/dashboard/RecommendationsList";
import { buttonClasses } from "@/components/ui/Button";
import { formatPrice } from "@/lib/utils/format";
import { PROPERTY_STATUS_LABELS } from "@/config/filters";

export const metadata = { title: "Dashboard" };

export default async function DashboardOverviewPage() {
  const access = await requireDashboardAccess();
  if (!access) redirect("/ingresar");

  await connectDB();

  const query = access.isAdmin ? {} : { agencyId: access.agencyId };
  let propertiesQuery = Property.find(query)
    .select("title slug status price stats publishedAt agencyId")
    .sort({ updatedAt: -1 })
    .limit(5);
  if (access.isAdmin) {
    propertiesQuery = propertiesQuery.populate({ path: "agencyId", select: "name" });
  }

  if (access.isAdmin) {
    const [properties, platformStats] = await Promise.all([
      propertiesQuery.lean(),
      getAgencyWeeklyStats(null),
    ]);

    return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-text">Resumen</h1>
            <p className="text-sm text-text-muted">
              Como admin ves y podés crear propiedades para cualquier inmobiliaria.{" "}
              <Link href="/admin" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                Gestionar inmobiliarias <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </p>
          </div>
          <Link
            href="/dashboard/propiedades/nueva"
            className={buttonClasses("primary", "md", "inline-flex items-center gap-1.5")}
          >
            <Plus className="h-4 w-4" aria-hidden /> Nueva propiedad
          </Link>
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-muted">Últimos 7 días — toda la plataforma</h2>
            <Link
              href="/admin/estadisticas"
              className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
            >
              Ver estadísticas completas <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Visualizaciones" metric={platformStats.views} />
            <StatTile label="Me gusta" metric={platformStats.likes} />
            <StatTile label="Guardados" metric={platformStats.saves} />
            <StatTile label="Comentarios" metric={platformStats.comments} />
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-muted">Propiedades recientes (todas las inmobiliarias)</h2>
            <Link href="/dashboard/propiedades" className="text-sm font-medium text-accent hover:underline">
              Ver todas
            </Link>
          </div>

          {properties.length === 0 ? (
            <p className="text-sm text-text-muted">Todavía no hay propiedades publicadas.</p>
          ) : (
            <div className="overflow-hidden rounded-card bg-surface shadow-card">
              {properties.map((p, i) => {
                const agency = p.agencyId as unknown as { name?: string } | null;
                return (
                  <Link
                    key={String(p._id)}
                    href={`/dashboard/propiedades/${p._id}/editar`}
                    className={`flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-surface-2 ${i > 0 ? "border-t border-border" : ""}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-text">{p.title}</p>
                      <p className="text-sm text-text-muted">
                        {formatPrice(p.price!.amount, p.price!.currency)} · {agency?.name ?? "—"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-pill bg-surface-2 px-2.5 py-1 text-xs font-medium text-text-muted">
                      {PROPERTY_STATUS_LABELS[p.status as keyof typeof PROPERTY_STATUS_LABELS] ?? p.status}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    );
  }

  const agencyId = access.agencyId!;
  const [stats, properties] = await Promise.all([getAgencyWeeklyStats(agencyId), propertiesQuery.lean()]);
  const recommendations = await getAgencyRecommendations(agencyId, stats);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-text">Resumen</h1>
        <Link
          href="/dashboard/propiedades/nueva"
          className={buttonClasses("primary", "md", "inline-flex items-center gap-1.5")}
        >
          <Plus className="h-4 w-4" aria-hidden /> Nueva propiedad
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-text-muted">Últimos 7 días</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Visualizaciones" metric={stats.views} />
          <StatTile label="Me gusta" metric={stats.likes} />
          <StatTile label="Guardados" metric={stats.saves} />
          <StatTile label="Comentarios" metric={stats.comments} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-text-muted">Recomendaciones</h2>
        <RecommendationsList recommendations={recommendations} />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-muted">Propiedades recientes</h2>
          <Link href="/dashboard/propiedades" className="text-sm font-medium text-accent hover:underline">
            Ver todas
          </Link>
        </div>

        {properties.length === 0 ? (
          <p className="text-sm text-text-muted">Todavía no publicaste ninguna propiedad.</p>
        ) : (
          <div className="overflow-hidden rounded-card bg-surface shadow-card">
            {properties.map((p, i) => (
              <Link
                key={String(p._id)}
                href={`/dashboard/propiedades/${p._id}/editar`}
                className={`flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-surface-2 ${i > 0 ? "border-t border-border" : ""}`}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-text">{p.title}</p>
                  <p className="text-sm text-text-muted">
                    {formatPrice(p.price!.amount, p.price!.currency)} · {p.stats?.views ?? 0} vistas
                  </p>
                </div>
                <span className="shrink-0 rounded-pill bg-surface-2 px-2.5 py-1 text-xs font-medium text-text-muted">
                  {PROPERTY_STATUS_LABELS[p.status as keyof typeof PROPERTY_STATUS_LABELS] ?? p.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
