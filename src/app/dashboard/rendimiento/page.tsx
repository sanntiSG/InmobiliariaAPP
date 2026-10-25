import { redirect } from "next/navigation";
import { Agency } from "@/lib/db/models/Agency";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { agencyScope } from "@/lib/auth/agency-scope";
import { connectDB } from "@/lib/db/connect";
import { getIntelligence } from "@/lib/intelligence/opportunities";
import { avgDwellSec, consultas, deltaPct, getDailySeries, type Totals } from "@/lib/intelligence/metrics";
import { GLOSSARY, interestText, perHundred } from "@/config/glossary";
import { StatTile } from "@/components/dashboard/StatTile";
import { DashboardReveal } from "@/components/dashboard/DashboardReveal";
import { AgencyFilterSelect } from "@/components/dashboard/AgencyFilterSelect";
import { OpportunitiesBoard } from "@/components/dashboard/OpportunitiesBoard";
import { TrendChart } from "@/components/dashboard/charts/TrendChart";
import { Meter } from "@/components/dashboard/charts/Meter";
import { BarList } from "@/components/dashboard/charts/BarList";
import { PanelTabs } from "@/components/panel/PanelTabs";

export const metadata = { title: "Rendimiento" };

const nf = new Intl.NumberFormat("es-AR");
const pctText = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`);

export default async function PerformancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await requireDashboardAccess();
  if (!access) redirect("/ingresar");

  const params = await searchParams;
  const rawAgency = params.agencyId;
  const scope = agencyScope(access, Array.isArray(rawAgency) ? rawAgency[0] : rawAgency);
  if (!scope) redirect("/");
  const rawView = params.vista;
  const vista = (Array.isArray(rawView) ? rawView[0] : rawView) === "mejorar" ? "mejorar" : "indicadores";

  await connectDB();
  const [intel, series, agencies] = await Promise.all([
    getIntelligence(scope.agencyId),
    getDailySeries({ agencyId: scope.agencyId }, 30),
    access.isAdmin ? Agency.find({}).select("name").sort({ name: 1 }).lean() : Promise.resolve(null),
  ]);

  const { w7, p7, d30 } = intel.totals;
  const metric = (pick: (t: Totals) => number) => ({ current: pick(w7), previous: pick(p7), deltaPct: deltaPct(pick(w7), pick(p7)) });
  const last14 = series.slice(-14);
  const trendOf = (pick: (p: (typeof series)[number]) => number) => last14.map(pick);

  const dwellNow = avgDwellSec(w7);
  const dwellBefore = avgDwellSec(p7);
  const dwellMetric = {
    current: dwellNow ?? 0,
    previous: dwellBefore ?? 0,
    deltaPct: dwellNow != null && dwellBefore != null ? deltaPct(dwellNow, dwellBefore) : null,
  };
  const f = intel.funnels;
  const improvable = intel.opportunities.filter((o) => o.kind !== "positive").length;
  const keep = access.isAdmin && scope.agencyId ? `&agencyId=${scope.agencyId}` : "";

  return (
    <DashboardReveal className="flex flex-col gap-6">
      <div data-reveal className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-text">Rendimiento</h1>
          <p className="max-w-2xl text-sm text-text-muted">
            {access.isAdmin && !scope.agencyId ? "Toda la plataforma. " : ""}
            Cómo les va a tus propiedades y qué podés hacer para que les vaya mejor. Se actualiza solo con cada visita, favorito y consulta.
          </p>
        </div>
        {access.isAdmin && agencies && (
          <AgencyFilterSelect
            agencies={agencies.map((a) => ({ id: String(a._id), name: a.name }))}
            selected={scope.agencyId ?? ""}
            basePath="/dashboard/rendimiento"
          />
        )}
      </div>

      <div data-reveal>
        <PanelTabs
          ariaLabel="Rendimiento"
          active={vista}
          tabs={[
            { id: "indicadores", label: "Los números", href: `/dashboard/rendimiento?vista=indicadores${keep}` },
            { id: "mejorar", label: "Qué mejorar", href: `/dashboard/rendimiento?vista=mejorar${keep}`, count: improvable },
          ]}
        />
      </div>

      {vista === "mejorar" ? (
        <>
          <p data-reveal className="max-w-2xl text-sm text-text-muted">
            El sistema revisa los números reales de tus propiedades y te cuenta qué está pasando, por qué y qué podrías hacer. Elegí por tipo o por prioridad.
          </p>
          <div data-reveal>
            <OpportunitiesBoard key={scope.agencyId ?? "all"} items={intel.opportunities} />
          </div>
        </>
      ) : (
        <>
          <section aria-label="Los números de la semana">
            <p className="mb-3 text-sm text-text-muted">Esta semana contra la anterior. Pasá el mouse por un recuadro para ver qué mide.</p>
            <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-3">
              <StatTile
                label={GLOSSARY.published.label}
                help={GLOSSARY.published.help}
                metric={{ current: intel.published, previous: 0, deltaPct: null }}
                hint="Visibles en el mapa y el listado"
              />
              <StatTile label={GLOSSARY.views.label} help={GLOSSARY.views.help} metric={metric((t) => t.views)} trend={trendOf((p) => p.views)} />
              <StatTile label={GLOSSARY.uniqueViews.label} help={GLOSSARY.uniqueViews.help} metric={metric((t) => t.uniqueViews)} trend={trendOf((p) => p.uniqueViews)} />
              <StatTile label={GLOSSARY.saves.label} help={GLOSSARY.saves.help} metric={metric((t) => t.saves)} trend={trendOf((p) => p.saves)} />
              <StatTile label={GLOSSARY.likes.label} help={GLOSSARY.likes.help} metric={metric((t) => t.likes)} trend={trendOf((p) => p.likes)} />
              <StatTile label={GLOSSARY.inquiries.label} help={GLOSSARY.inquiries.help} metric={metric(consultas)} trend={trendOf((p) => p.inquiries + p.contacts)} />
              <StatTile label={GLOSSARY.shares.label} help={GLOSSARY.shares.help} metric={metric((t) => t.shares)} trend={trendOf((p) => p.shares)} />
              <StatTile label={GLOSSARY.tourOpens.label} help={GLOSSARY.tourOpens.help} metric={metric((t) => t.tourOpens)} trend={trendOf((p) => p.tourOpens)} />
              <StatTile
                label={GLOSSARY.dwell.label}
                help={GLOSSARY.dwell.help}
                metric={dwellMetric}
                format="seconds"
                hint={dwellNow == null ? "Todavía sin lecturas medidas" : "Sin datos de la semana pasada"}
              />
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <section data-reveal className="min-w-0 rounded-card bg-surface p-5 shadow-card lg:col-span-2">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="font-display text-lg font-semibold text-text">Visitas de los últimos 30 días</h2>
                <span className="text-sm text-text-muted">{nf.format(d30.views)} en total</span>
              </div>
              <TrendChart points={series} label="Visitas por día" />
            </section>

            <section data-reveal className="min-w-0 flex flex-col gap-5 rounded-card bg-surface p-5 shadow-card">
              <div>
                <h2 className="font-display text-lg font-semibold text-text">Del interés a la visita</h2>
                <p className="text-sm text-text-muted">Últimos 30 días. La rayita marca lo típico de propiedades similares.</p>
              </div>
              <Meter
                label="Visitas que terminan en favorito"
                value={f.visitsToSaves}
                reference={intel.benchmark.saveRate}
                valueText={pctText(f.visitsToSaves)}
                caption={`${perHundred(f.visitsToSaves) ?? "—"} visitas · ${nf.format(d30.saves)} de ${nf.format(d30.views)}`}
              />
              <Meter
                label="Visitas que terminan en consulta"
                value={f.visitsToConsultas}
                reference={intel.benchmark.inquiryRate}
                valueText={pctText(f.visitsToConsultas)}
                caption={`${perHundred(f.visitsToConsultas) ?? "—"} visitas · ${nf.format(consultas(d30))} de ${nf.format(d30.views)}`}
              />
              <Meter
                label="Consultas que llegan a una visita"
                value={f.consultasToVisits}
                valueText={pctText(f.consultasToVisits)}
                caption={`${nf.format(intel.leads.visitDone)} de ${nf.format(intel.leads.total)} clientes`}
              />
            </section>
          </div>

          <section data-reveal className="flex min-w-0 flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
            <div>
              <h2 className="font-display text-lg font-semibold text-text">Las propiedades que más interés despiertan</h2>
              <p className="text-sm text-text-muted">
                El interés suma visitas, favoritos, consultas y demás movimientos de los últimos 30 días: cuanto más, más alto.
              </p>
            </div>
            <BarList
              emptyText="Cuando lleguen las primeras visitas, acá vas a ver cuáles destacan."
              items={intel.working.map((p) => ({
                label: p.title,
                value: p.score,
                valueText: interestText(p.score),
                sublabel: p.dominant ? `Sobre todo ${p.dominant}` : undefined,
                href: `/dashboard/propiedades/${p.id}/estadisticas`,
              }))}
            />
          </section>
        </>
      )}
    </DashboardReveal>
  );
}
