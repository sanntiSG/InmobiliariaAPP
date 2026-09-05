import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { connectDB } from "@/lib/db/connect";
import { getAgencyWeeklyStats, getAgencyRanking } from "@/lib/analytics/agency-stats";
import { StatTile } from "@/components/dashboard/StatTile";

export const metadata = { title: "Admin — Estadísticas" };

export default async function AdminStatsPage() {
  const admin = await requireAdminUser();
  if (!admin) redirect("/ingresar");

  await connectDB();

  const [stats, ranking] = await Promise.all([
    getAgencyWeeklyStats(null),
    getAgencyRanking(10),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-text">Estadísticas de la plataforma</h1>
        <p className="text-sm text-text-muted">Actividad de todas las inmobiliarias, últimos 7 días.</p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-text-muted">Últimos 7 días — toda la plataforma</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Visualizaciones" metric={stats.views} />
          <StatTile label="Me gusta" metric={stats.likes} />
          <StatTile label="Guardados" metric={stats.saves} />
          <StatTile label="Comentarios" metric={stats.comments} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-text-muted">Ranking de inmobiliarias (7 días)</h2>
        {ranking.length === 0 ? (
          <div className="rounded-card bg-surface p-10 text-center shadow-card">
            <p className="text-text-muted">Todavía no hay actividad registrada esta semana.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-card bg-surface shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-muted">
                    <th className="px-5 py-3 font-medium">Inmobiliaria</th>
                    <th className="px-5 py-3 font-medium">Vistas</th>
                    <th className="px-5 py-3 font-medium">Me gusta</th>
                    <th className="px-5 py-3 font-medium">Guardados</th>
                    <th className="px-5 py-3 font-medium">Comentarios</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((row) => (
                    <tr key={row.agencyId} className="border-b border-border last:border-0">
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/inmobiliarias/${row.agencyId}/editar`}
                          className="font-medium text-text hover:underline"
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-text">{row.views}</td>
                      <td className="px-5 py-3 text-text">{row.likes}</td>
                      <td className="px-5 py-3 text-text">{row.saves}</td>
                      <td className="px-5 py-3 text-text">{row.comments}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
