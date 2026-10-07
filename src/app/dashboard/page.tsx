import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { ArrowRight, Clapperboard, ImagePlus, Plus, Store } from "lucide-react";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { agencyScope } from "@/lib/auth/agency-scope";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { getIntelligence } from "@/lib/intelligence/opportunities";
import { avgDwellSec, consultas, deltaPct, getDailySeries, type Totals } from "@/lib/intelligence/metrics";
import { maybeSendOpportunityNotifications } from "@/lib/intelligence/notify";
import { StatTile } from "@/components/dashboard/StatTile";
import { DiagnosticCard } from "@/components/dashboard/DiagnosticCard";
import { DashboardReveal } from "@/components/dashboard/DashboardReveal";
import { AgencyFilterSelect } from "@/components/dashboard/AgencyFilterSelect";
import { TrendChart } from "@/components/dashboard/charts/TrendChart";
import { Meter } from "@/components/dashboard/charts/Meter";
import { BarList } from "@/components/dashboard/charts/BarList";
import { buttonClasses } from "@/components/ui/Button";

export const metadata = { title: "Resumen" };

const pctText = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`);
const nf = new Intl.NumberFormat("es-AR");

export default async function DashboardOverviewPage({ searchParams }: PageProps<"/dashboard">) {
  const access = await requireDashboardAccess();
  if (!access) redirect("/ingresar");

  const rawAgency = (await searchParams).agencyId;
  const scope = agencyScope(access, Array.isArray(rawAgency) ? rawAgency[0] : rawAgency);
  if (!scope) redirect("/");

  await connectDB();
  const [intel, series, agencies] = await Promise.all([
    getIntelligence(scope.agencyId),
    getDailySeries({ agencyId: scope.agencyId }, 30),
    access.isAdmin ? Agency.find({}).select("name").sort({ name: 1 }).lean() : Promise.resolve(null),
  ]);

  // Avisos de oportunidades importantes a la inmobiliaria, fuera del render.
  if (!access.isAdmin && scope.agencyId) after(() => maybeSendOpportunityNotifications(scope.agencyId!));

  const { w7, p7, d30 } = intel.totals;
  const metric = (pick: (t: Totals) => number) => ({
    current: pick(w7),
    previous: pick(p7),
    deltaPct: deltaPct(pick(w7), pick(p7)),
  });
  const last14 = series.slice(-14);
  const trendOf = (pick: (p: (typeof series)[number]) => number) => last14.map(pick);

  const dwellNow = avgDwellSec(w7);
  const dwellBefore = avgDwellSec(p7);
  const dwellMetric = {
    current: dwellNow ?? 0,
    previous: dwellBefore ?? 0,
    deltaPct: dwellNow != null && dwellBefore != null ? deltaPct(dwellNow, dwellBefore) : null,
  };

  const hasTraffic = d30.views > 0;
  const attention = intel.opportunities.filter((o) => o.kind === "attention");
  const positives = intel.opportunities.filter((o) => o.kind === "positive");
  const topOpportunities = intel.opportunities.filter((o) => o.kind !== "positive").slice(0, 3);
  const f = intel.funnels;

  return (
    <DashboardReveal className="flex flex-col gap-8">
      <div data-reveal className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-text">Resumen</h1>
          <p className="text-sm text-text-muted">
            {access.isAdmin && !scope.agencyId
              ? "Toda la plataforma. "
              : ""}
            Esta semana contra la anterior, con la tendencia de los últimos 30 días.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {access.isAdmin && agencies && (
            <AgencyFilterSelect
              agencies={agencies.map((a) => ({ id: String(a._id), name: a.name }))}
              selected={scope.agencyId ?? ""}
              basePath="/dashboard"
            />
          )}
          <Link href="/dashboard/propiedades/nueva" className={buttonClasses("primary", "md", "inline-flex items-center gap-1.5")}>
            <Plus className="h-4 w-4" aria-hidden /> Nueva propiedad
          </Link>
        </div>
      </div>

      {intel.published === 0 && !access.isAdmin && (
        <section data-reveal className="flex flex-col gap-4 rounded-card bg-surface p-6 shadow-card">
          <div>
            <h2 className="font-display text-lg font-semibold text-text">Primeros pasos</h2>
            <p className="text-sm text-text-muted">
              Desde acá manejás todo lo de tu inmobiliaria. Empezá por estos tres pasos; en cuanto publiques la primera
              propiedad, este panel te muestra cómo le va.
            </p>
          </div>
          <ol className="grid gap-3 md:grid-cols-3">
            {[
              { href: "/dashboard/inmobiliaria", icon: Store, title: "Completá tu perfil", text: "Logo, portada y datos de contacto." },
              { href: "/dashboard/propiedades/nueva", icon: ImagePlus, title: "Cargá tu primera propiedad", text: "Casa, departamento… con fotos y recorrido 360°." },
              { href: "/dashboard/inmobiliaria", icon: Clapperboard, title: "Vinculá tu YouTube", text: "Sumá videos a tus publicaciones." },
            ].map(({ href, icon: Icon, title, text }, i) => (
              <li key={title}>
                <Link
                  href={href}
                  className="group flex h-full flex-col gap-2 rounded-media bg-surface-2 p-4 transition-[transform,box-shadow] duration-150 [transition-timing-function:var(--ease-out)] hover:-translate-y-0.5 hover:shadow-card active:scale-[0.99]"
                >
                  <span className="flex items-center gap-2 text-xs font-semibold text-accent">
                    <Icon className="h-4 w-4" aria-hidden /> Paso {i + 1}
                  </span>
                  <span className="font-display text-base font-semibold text-text">{title}</span>
                  <span className="text-sm text-text-muted">{text}</span>
                  <span className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-medium text-accent">
                    Ir <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {intel.published === 0 && access.isAdmin && (
        <div data-reveal className="rounded-card bg-surface p-8 text-center shadow-card">
          <p className="font-medium text-text">Todavía no hay propiedades publicadas.</p>
          <Link href="/dashboard/propiedades/nueva" className={buttonClasses("primary", "md", "mt-4 inline-flex")}>
            Cargar una propiedad
          </Link>
        </div>
      )}

      {intel.published > 0 && !hasTraffic && (
        <p data-reveal className="rounded-card bg-accent-soft p-4 text-sm text-text">
          Todavía no se registraron visitas en los últimos 30 días. Los números y los diagnósticos aparecen apenas
          lleguen las primeras.
        </p>
      )}

      <section data-reveal aria-label="Indicadores de la semana">
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-3">
          <StatTile
            label="Propiedades publicadas"
            metric={{ current: intel.published, previous: 0, deltaPct: null }}
            hint="Visibles en el mapa y el listado"
          />
          <StatTile label="Visitas" metric={metric((t) => t.views)} trend={trendOf((p) => p.views)} />
          <StatTile label="Visitas únicas" metric={metric((t) => t.uniqueViews)} trend={trendOf((p) => p.uniqueViews)} />
          <StatTile label="Favoritos" metric={metric((t) => t.saves)} trend={trendOf((p) => p.saves)} />
          <StatTile label="Me gusta" metric={metric((t) => t.likes)} trend={trendOf((p) => p.likes)} />
          <StatTile label="Consultas" metric={metric(consultas)} trend={trendOf((p) => p.inquiries + p.contacts)} />
          <StatTile label="Compartidas" metric={metric((t) => t.shares)} trend={trendOf((p) => p.shares)} />
          <StatTile label="Visitas a recorridos 360°" metric={metric((t) => t.tourOpens)} trend={trendOf((p) => p.tourOpens)} />
          <StatTile label="Tiempo promedio en la ficha" metric={dwellMetric} format="seconds" hint="Todavía sin lecturas medidas" />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section data-reveal className="rounded-card bg-surface p-5 shadow-card lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-text">Visitas de los últimos 30 días</h2>
            <span className="text-sm text-text-muted">{nf.format(d30.views)} en total</span>
          </div>
          <TrendChart points={series} label="Visitas por día" />
        </section>

        <section data-reveal className="flex flex-col gap-5 rounded-card bg-surface p-5 shadow-card">
          <div>
            <h2 className="font-display text-lg font-semibold text-text">¿Se convierte el interés?</h2>
            <p className="text-sm text-text-muted">Últimos 30 días, contra propiedades similares.</p>
          </div>
          <Meter
            label="Visitas → favoritos"
            value={f.visitsToSaves}
            reference={intel.benchmark.saveRate}
            valueText={pctText(f.visitsToSaves)}
            caption={`${nf.format(d30.saves)} de ${nf.format(d30.views)} visitas`}
          />
          <Meter
            label="Visitas → consultas"
            value={f.visitsToConsultas}
            reference={intel.benchmark.inquiryRate}
            valueText={pctText(f.visitsToConsultas)}
            caption={`${nf.format(consultas(d30))} de ${nf.format(d30.views)} visitas`}
          />
          <Meter
            label="Consultas → visitas presenciales"
            value={f.consultasToVisits}
            valueText={pctText(f.consultasToVisits)}
            caption={`${nf.format(intel.leads.visitDone)} de ${nf.format(intel.leads.total)} clientes`}
          />
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section data-reveal className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
          <div>
            <h2 className="font-display text-lg font-semibold text-text">¿Qué está funcionando?</h2>
            <p className="text-sm text-text-muted">Las propiedades que más interés generan.</p>
          </div>
          <BarList
            emptyText="Cuando lleguen las primeras visitas, acá vas a ver cuáles destacan."
            items={intel.working.map((p) => ({
              label: p.title,
              value: p.score,
              valueText: `${nf.format(p.score)} pts`,
              sublabel: p.dominant ? `Sobre todo ${p.dominant}` : undefined,
              href: `/dashboard/propiedades/${p.id}/estadisticas`,
            }))}
          />
          {positives.slice(0, 2).map((d) => (
            <DiagnosticCard key={d.id} diagnostic={d} compact />
          ))}
        </section>

        <section data-reveal className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
          <div>
            <h2 className="font-display text-lg font-semibold text-text">¿Qué necesita atención?</h2>
            <p className="text-sm text-text-muted">Lo que no está funcionando como debería.</p>
          </div>
          {attention.length === 0 ? (
            <p className="rounded-media bg-success-soft p-4 text-sm text-text">
              Todo en orden: no detectamos nada que requiera atención.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {attention.slice(0, 4).map((d) => (
                <li key={d.id} className="rounded-media bg-surface-2 p-4">
                  <p className="text-sm font-semibold text-text">{d.title}</p>
                  {d.propertyTitle && <p className="text-xs text-text-muted">{d.propertyTitle}</p>}
                  <p className="mt-1 text-sm text-text-muted">{d.explanation}</p>
                  {d.propertyId && (
                    <Link
                      href={`/dashboard/propiedades/${d.propertyId}/estadisticas`}
                      className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
                    >
                      Ver diagnóstico <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section data-reveal className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-text">Oportunidades</h2>
            <p className="text-sm text-text-muted">Dónde hay margen para mejorar, ordenadas por prioridad.</p>
          </div>
          <Link href="/dashboard/oportunidades" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
            Ver todas ({intel.opportunities.filter((o) => o.kind !== "positive").length}) <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
        {topOpportunities.length === 0 ? (
          <p className="rounded-card bg-surface p-5 text-sm text-text-muted shadow-card">No hay oportunidades pendientes por ahora.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-1">
            {topOpportunities.map((d) => (
              <DiagnosticCard key={d.id} diagnostic={d} compact />
            ))}
          </div>
        )}
      </section>
    </DashboardReveal>
  );
}
