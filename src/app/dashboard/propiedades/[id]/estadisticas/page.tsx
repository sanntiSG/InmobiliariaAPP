import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { Types } from "mongoose";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { agencyScope, scopeFilter } from "@/lib/auth/agency-scope";
import { connectDB } from "@/lib/db/connect";
import { Property } from "@/lib/db/models/Property";
import { getIntelligence } from "@/lib/intelligence/opportunities";
import {
  avgDwellSec,
  computeFunnels,
  consultas,
  deltaPct,
  getDailySeries,
  getLeadFunnels,
  getSceneVisits,
  type Totals,
} from "@/lib/intelligence/metrics";
import { StatTile } from "@/components/dashboard/StatTile";
import { DiagnosticCard } from "@/components/dashboard/DiagnosticCard";
import { DashboardReveal } from "@/components/dashboard/DashboardReveal";
import { TrendChart } from "@/components/dashboard/charts/TrendChart";
import { Meter } from "@/components/dashboard/charts/Meter";
import { BarList } from "@/components/dashboard/charts/BarList";
import { buttonClasses } from "@/components/ui/Button";
import { formatPrice } from "@/lib/utils/format";

export const metadata = { title: "Estadísticas de la propiedad" };

const nf = new Intl.NumberFormat("es-AR");
const pctText = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`);

export default async function PropertyStatsPage({ params }: PageProps<"/dashboard/propiedades/[id]/estadisticas">) {
  const access = await requireDashboardAccess();
  if (!access) redirect("/ingresar");
  const scope = agencyScope(access);
  if (!scope) redirect("/");

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  await connectDB();
  // El filtro por inmobiliaria va en la query: una propiedad ajena se ve como inexistente.
  const property = await Property.findOne({ _id: id, ...scopeFilter(scope) })
    .select("title slug status price agencyId media.tours")
    .lean();
  if (!property) notFound();

  const agencyId = String(property.agencyId);
  const [intel, series, scenes, leadFunnels] = await Promise.all([
    getIntelligence(agencyId),
    getDailySeries({ propertyIds: [id] }, 30),
    getSceneVisits(id),
    getLeadFunnels({ agencyId }),
  ]);

  const insight = intel.properties.find((p) => p.id === id) ?? null;
  const emptyLeads = { total: 0, contacted: 0, visitRequested: 0, visitDone: 0, offers: 0, closed: 0, stale: 0 };
  const leads = leadFunnels.byProperty.get(id) ?? emptyLeads;
  const d30 = insight?.d30;
  const funnels = d30 ? computeFunnels(d30, leads) : null;

  const metric = (pick: (t: Totals) => number) => ({
    current: insight ? pick(insight.w7) : 0,
    previous: insight ? pick(insight.p7) : 0,
    deltaPct: insight ? deltaPct(pick(insight.w7), pick(insight.p7)) : null,
  });
  const last14 = series.slice(-14);
  const tours = (property.media?.tours ?? []) as { id?: string; label?: string }[];
  const sceneItems = [...scenes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([sceneId, count]) => {
      const index = tours.findIndex((t) => t.id === sceneId);
      return { label: tours[index]?.label?.trim() || (index >= 0 ? `Foto ${index + 1}` : "Ambiente eliminado"), value: count };
    });

  const dwellNow = insight ? avgDwellSec(insight.w7) : null;
  const dwellBefore = insight ? avgDwellSec(insight.p7) : null;

  return (
    <DashboardReveal className="flex flex-col gap-8">
      <div data-reveal className="flex flex-col gap-3">
        <Link href="/dashboard/propiedades" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-text-muted hover:text-text">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Mis propiedades
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold text-text">{property.title}</h1>
            <p className="text-sm text-text-muted">{formatPrice(property.price!.amount, property.price!.currency)}</p>
          </div>
          <div className="flex gap-2">
            <Link href={`/propiedades/${property.slug}`} className={buttonClasses("secondary", "sm")}>
              Ver publicación
            </Link>
            <Link href={`/dashboard/propiedades/${id}/editar`} className={buttonClasses("primary", "sm", "inline-flex items-center gap-1.5")}>
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
            </Link>
          </div>
        </div>
      </div>

      {!insight ? (
        <p data-reveal className="rounded-card bg-accent-soft p-4 text-sm text-text">
          Las estadísticas y el diagnóstico se calculan para propiedades publicadas. Publicá esta propiedad para empezar a medirla.
        </p>
      ) : (
        <>
          <section data-reveal aria-label="Indicadores de la semana">
            <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-3">
              <StatTile label="Visitas" metric={metric((t) => t.views)} trend={last14.map((p) => p.views)} />
              <StatTile label="Visitas únicas" metric={metric((t) => t.uniqueViews)} trend={last14.map((p) => p.uniqueViews)} />
              <StatTile label="Favoritos" metric={metric((t) => t.saves)} trend={last14.map((p) => p.saves)} />
              <StatTile label="Consultas" metric={metric(consultas)} trend={last14.map((p) => p.inquiries + p.contacts)} />
              <StatTile label="Compartidas" metric={metric((t) => t.shares)} trend={last14.map((p) => p.shares)} />
              <StatTile
                label="Tiempo promedio en la ficha"
                metric={{
                  current: dwellNow ?? 0,
                  previous: dwellBefore ?? 0,
                  deltaPct: dwellNow != null && dwellBefore != null ? deltaPct(dwellNow, dwellBefore) : null,
                }}
                format="seconds"
                hint="Todavía sin lecturas medidas"
              />
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <section data-reveal className="rounded-card bg-surface p-5 shadow-card lg:col-span-2">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="font-display text-lg font-semibold text-text">Visitas de los últimos 30 días</h2>
                <span className="text-sm text-text-muted">{nf.format(insight.d30.views)} en total</span>
              </div>
              <TrendChart points={series} label="Visitas por día" />
            </section>

            <section data-reveal className="flex flex-col gap-5 rounded-card bg-surface p-5 shadow-card">
              <h2 className="font-display text-lg font-semibold text-text">Conversión</h2>
              <Meter
                label="Visitas → favoritos"
                value={funnels!.visitsToSaves}
                valueText={pctText(funnels!.visitsToSaves)}
                caption={`${nf.format(insight.d30.saves)} de ${nf.format(insight.d30.views)} visitas`}
                reference={intel.benchmark.saveRate}
              />
              <Meter
                label="Visitas → consultas"
                value={funnels!.visitsToConsultas}
                valueText={pctText(funnels!.visitsToConsultas)}
                caption={`${nf.format(consultas(insight.d30))} de ${nf.format(insight.d30.views)} visitas`}
                reference={intel.benchmark.inquiryRate}
              />
              <Meter
                label="Consultas → visitas presenciales"
                value={funnels!.consultasToVisits}
                valueText={pctText(funnels!.consultasToVisits)}
                caption={`${nf.format(leads.visitDone)} de ${nf.format(leads.total)} clientes`}
              />
            </section>
          </div>

          <section data-reveal className="flex flex-col gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-text">Diagnóstico</h2>
              <p className="text-sm text-text-muted">Qué está pasando con esta propiedad y qué podrías hacer.</p>
            </div>
            {insight.diagnostics.length === 0 ? (
              <p className="rounded-card bg-success-soft p-5 text-sm text-text">
                Todo en orden: no detectamos nada que corregir en esta propiedad.
              </p>
            ) : (
              insight.diagnostics.map((d) => <DiagnosticCard key={d.id} diagnostic={d} />)
            )}
          </section>

          {tours.length > 0 && (
            <section data-reveal className="rounded-card bg-surface p-5 shadow-card">
              <h2 className="font-display text-lg font-semibold text-text">Ambientes más visitados</h2>
              <p className="mb-4 text-sm text-text-muted">Fotos del recorrido 360° que más se miraron en los últimos 30 días.</p>
              <BarList items={sceneItems} emptyText="Todavía nadie recorrió el 360° de esta propiedad." />
            </section>
          )}
        </>
      )}
    </DashboardReveal>
  );
}
