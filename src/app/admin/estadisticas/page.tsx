import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CircleCheck, TriangleAlert } from "lucide-react";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { connectDB } from "@/lib/db/connect";
import { getAdminIntelligence, type GrowthRow } from "@/lib/intelligence/admin";
import { getDailySeries } from "@/lib/intelligence/metrics";
import { StatTile } from "@/components/dashboard/StatTile";
import { DashboardReveal } from "@/components/dashboard/DashboardReveal";
import { TrendChart } from "@/components/dashboard/charts/TrendChart";
import { BarList } from "@/components/dashboard/charts/BarList";
import { cn } from "@/lib/utils/cn";

export const metadata = { title: "Admin — Estadísticas" };

const nf = new Intl.NumberFormat("es-AR");

function Delta({ value }: { value: number | null }) {
  if (value == null) return <span className="text-text-muted">—</span>;
  const up = value >= 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium", up ? "text-success" : "text-danger")}>
      <Arrow className="h-3.5 w-3.5" aria-hidden />
      {Math.abs(value)}%
    </span>
  );
}

function GrowthList({ rows, empty }: { rows: GrowthRow[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-text-muted">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.name} className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0 truncate text-text">{r.name}</span>
          <span className="flex shrink-0 items-baseline gap-2">
            <span className="text-text-muted">
              {nf.format(r.current)} <span className="text-xs">(antes {nf.format(r.previous)})</span>
            </span>
            <Delta value={r.deltaPct} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function AdminStatsPage() {
  const admin = await requireAdminUser();
  if (!admin) redirect("/ingresar");

  await connectDB();
  const [intel, series] = await Promise.all([getAdminIntelligence(), getDailySeries({}, 30)]);
  const behavior = (name: string) => intel.behaviors.find((b) => b.name === name)!;
  const asMetric = (b: GrowthRow) => ({ current: b.current, previous: b.previous, deltaPct: b.deltaPct });
  const last14 = series.slice(-14);

  return (
    <DashboardReveal className="flex flex-col gap-8">
      <div data-reveal>
        <h1 className="font-display text-2xl font-bold text-text">Estadísticas de la plataforma</h1>
        <p className="text-sm text-text-muted">
          Qué está funcionando, quién genera más interés y qué requiere tu atención. Esta semana contra la anterior.
        </p>
      </div>

      <section data-reveal aria-label="Indicadores de la plataforma">
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-3">
          <StatTile label="Visitas" metric={asMetric(behavior("Visitas"))} trend={last14.map((p) => p.views)} />
          <StatTile label="Favoritos" metric={asMetric(behavior("Favoritos"))} trend={last14.map((p) => p.saves)} />
          <StatTile label="Consultas" metric={asMetric(behavior("Consultas"))} trend={last14.map((p) => p.inquiries + p.contacts)} />
          <StatTile label="Usuarios nuevos" metric={intel.platform.newUsers} hint={`${nf.format(intel.platform.users)} usuarios en total`} />
          <StatTile
            label="Inmobiliarias nuevas"
            metric={intel.platform.newAgencies}
            hint={`${nf.format(intel.platform.activeAgencies)} activas`}
          />
          <StatTile
            label="Propiedades publicadas"
            metric={{ current: intel.platform.publishedProperties, previous: 0, deltaPct: null }}
            hint="En toda la plataforma"
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section data-reveal className="rounded-card bg-surface p-5 shadow-card lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-text">Visitas de los últimos 30 días</h2>
            <span className="text-sm text-text-muted">{nf.format(intel.totals.d30.views)} en total</span>
          </div>
          <TrendChart points={series} label="Visitas por día en toda la plataforma" />
        </section>

        <section data-reveal className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
          <h2 className="font-display text-lg font-semibold text-text">Requiere atención</h2>
          {intel.attention.length === 0 ? (
            <p className="flex items-start gap-2 rounded-media bg-success-soft p-4 text-sm text-text">
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
              Todo en orden: no hay nada pendiente.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {intel.attention.map((a) => (
                <li key={a.id} className="rounded-media bg-surface-2 p-3.5">
                  <p className="flex items-start gap-2 text-sm font-semibold text-text">
                    <TriangleAlert
                      className={cn("mt-0.5 h-4 w-4 shrink-0", a.severity === "high" ? "text-danger" : "text-warning")}
                      aria-hidden
                    />
                    {a.title}
                  </p>
                  <p className="mt-1 text-sm text-text-muted">{a.detail}</p>
                  <Link href={a.href} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
                    Ver <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section data-reveal className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-text">Inmobiliarias con más actividad</h2>
        {intel.agencies.length === 0 ? (
          <p className="rounded-card bg-surface p-8 text-center text-sm text-text-muted shadow-card">Todavía no hay inmobiliarias activas.</p>
        ) : (
          <div className="overflow-hidden rounded-card bg-surface shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-muted">
                    <th className="px-5 py-3 font-medium">Inmobiliaria</th>
                    <th className="px-5 py-3 text-right font-medium">Publicadas</th>
                    <th className="px-5 py-3 text-right font-medium">Visitas (7 d)</th>
                    <th className="px-5 py-3 text-right font-medium">Variación</th>
                    <th className="px-5 py-3 text-right font-medium">Favoritos</th>
                    <th className="px-5 py-3 text-right font-medium">Consultas</th>
                  </tr>
                </thead>
                <tbody>
                  {intel.agencies.slice(0, 10).map((row) => (
                    <tr key={row.agencyId} className="border-b border-border last:border-0">
                      <td className="px-5 py-3">
                        <Link href={`/dashboard?agencyId=${row.agencyId}`} className="font-medium text-text hover:text-accent hover:underline">
                          {row.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-right text-text">{nf.format(row.published)}</td>
                      <td className="px-5 py-3 text-right text-text">{nf.format(row.views)}</td>
                      <td className="px-5 py-3 text-right">
                        <Delta value={row.viewsDelta} />
                      </td>
                      <td className="px-5 py-3 text-right text-text">{nf.format(row.saves)}</td>
                      <td className="px-5 py-3 text-right text-text">{nf.format(row.consultas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section data-reveal className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
          <div>
            <h2 className="font-display text-lg font-semibold text-text">Propiedades con más interés</h2>
            <p className="text-sm text-text-muted">Visitas, favoritos y consultas de los últimos 30 días.</p>
          </div>
          <BarList
            emptyText="Cuando lleguen las primeras visitas, acá vas a ver cuáles destacan."
            items={intel.topProperties.map((p) => ({
              label: p.title,
              value: p.score,
              valueText: `${nf.format(p.score)} pts`,
              sublabel: `${p.agencyName} · ${nf.format(p.views)} visitas · ${nf.format(p.saves)} favoritos · ${nf.format(p.consultas)} consultas`,
              href: `/dashboard/propiedades/${p.id}/estadisticas`,
            }))}
          />
        </section>

        <section data-reveal className="flex flex-col gap-5 rounded-card bg-surface p-5 shadow-card">
          <div>
            <h2 className="font-display text-lg font-semibold text-text">¿Qué está creciendo?</h2>
            <p className="text-sm text-text-muted">Esta semana contra la anterior.</p>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-text-muted">Comportamiento de los usuarios</h3>
            <GrowthList rows={intel.behaviors} empty="Sin datos todavía." />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-text-muted">Zonas con más visitas nuevas</h3>
            <GrowthList rows={intel.growingZones} empty="Ninguna zona creció lo suficiente esta semana." />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-text-muted">Tipos de propiedad en alza</h3>
            <GrowthList rows={intel.growingTypes} empty="Ningún tipo creció lo suficiente esta semana." />
          </div>
        </section>
      </div>
    </DashboardReveal>
  );
}
