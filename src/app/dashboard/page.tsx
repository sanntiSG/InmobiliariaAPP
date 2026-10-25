import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { ArrowRight, Clapperboard, ImagePlus, Plus, Store } from "lucide-react";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { agencyScope } from "@/lib/auth/agency-scope";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { getIntelligence } from "@/lib/intelligence/opportunities";
import { consultas, deltaPct, getDailySeries, type Totals } from "@/lib/intelligence/metrics";
import { maybeSendOpportunityNotifications } from "@/lib/intelligence/notify";
import { buildTodayList } from "@/lib/intelligence/today";
import { GLOSSARY, interestText } from "@/config/glossary";
import { StatTile } from "@/components/dashboard/StatTile";
import { TodayList } from "@/components/dashboard/TodayList";
import { DashboardReveal } from "@/components/dashboard/DashboardReveal";
import { AgencyFilterSelect } from "@/components/dashboard/AgencyFilterSelect";
import { TrendChart } from "@/components/dashboard/charts/TrendChart";
import { BarList } from "@/components/dashboard/charts/BarList";
import { buttonClasses } from "@/components/ui/Button";

export const metadata = { title: "Hoy" };

const nf = new Intl.NumberFormat("es-AR");
const dateFmt = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" });

export default async function DashboardTodayPage({ searchParams }: PageProps<"/dashboard">) {
  const access = await requireDashboardAccess();
  if (!access) redirect("/ingresar");

  const rawAgency = (await searchParams).agencyId;
  const scope = agencyScope(access, Array.isArray(rawAgency) ? rawAgency[0] : rawAgency);
  if (!scope) redirect("/");

  await connectDB();
  const [intel, series, agencies] = await Promise.all([
    getIntelligence(scope.agencyId),
    getDailySeries({ agencyId: scope.agencyId }, 14),
    access.isAdmin ? Agency.find({}).select("name").sort({ name: 1 }).lean() : Promise.resolve(null),
  ]);

  // Avisos de oportunidades importantes a la inmobiliaria, fuera del render.
  if (!access.isAdmin && scope.agencyId) after(() => maybeSendOpportunityNotifications(scope.agencyId!));

  const { w7, p7 } = intel.totals;
  const metric = (pick: (t: Totals) => number) => ({ current: pick(w7), previous: pick(p7), deltaPct: deltaPct(pick(w7), pick(p7)) });
  const trendOf = (pick: (p: (typeof series)[number]) => number) => series.map(pick);

  const today = buildTodayList({ opportunities: intel.opportunities, staleClients: intel.leads.stale });
  const hasTraffic = intel.totals.d30.views > 0;
  const date = dateFmt.format(new Date());

  return (
    <DashboardReveal className="flex flex-col gap-8">
      <div data-reveal className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-text">Hoy</h1>
          <p className="text-sm text-text-muted">
            <span className="first-letter:uppercase">{date}</span>. {access.isAdmin && !scope.agencyId ? "Toda la plataforma. " : ""}Lo más importante, en un vistazo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
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
              Desde acá manejás todo lo de tu inmobiliaria. Empezá por estos tres pasos; en cuanto publiques la primera propiedad, este panel te muestra cómo le va.
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
          Todavía no se registraron visitas en los últimos 30 días. Los números y las recomendaciones aparecen apenas lleguen las primeras.
        </p>
      )}

      <section aria-label="Lo esencial de la semana">
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
          <StatTile label={GLOSSARY.views.label} help={GLOSSARY.views.help} metric={metric((t) => t.views)} trend={trendOf((p) => p.views)} />
          <StatTile label={GLOSSARY.inquiries.label} help={GLOSSARY.inquiries.help} metric={metric(consultas)} trend={trendOf((p) => p.inquiries + p.contacts)} />
          <StatTile
            label={GLOSSARY.staleClients.label}
            help={GLOSSARY.staleClients.help}
            metric={{ current: intel.leads.stale, previous: 0, deltaPct: null }}
            hint={intel.leads.stale > 0 ? "Respondelos hoy" : "Estás al día"}
            href="/dashboard/clientes"
          />
          <StatTile
            label={GLOSSARY.published.label}
            help={GLOSSARY.published.help}
            metric={{ current: intel.published, previous: 0, deltaPct: null }}
            hint="Visibles en el mapa y el listado"
            href="/dashboard/propiedades"
          />
        </div>
        <p className="mt-2 text-xs text-text-muted">Visitas y consultas: esta semana contra la anterior.</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <section data-reveal className="flex min-w-0 flex-col gap-4 rounded-card bg-surface p-5 shadow-card lg:col-span-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-text">Qué hacer hoy</h2>
            <p className="text-sm text-text-muted">Lo que más puede mover tus resultados, de lo más urgente a lo menos.</p>
          </div>
          <TodayList items={today} />
          <Link href="/dashboard/rendimiento?vista=mejorar" className="group inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-accent">
            Ver todo lo que se puede mejorar
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </section>

        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <section data-reveal className="min-w-0 rounded-card bg-surface p-5 shadow-card">
            <div className="mb-3">
              <h2 className="font-display text-lg font-semibold text-text">Visitas de los últimos 14 días</h2>
              <p className="text-sm text-text-muted">{nf.format(series.reduce((sum, p) => sum + p.views, 0))} en total</p>
            </div>
            <TrendChart points={series} label="Visitas por día" />
          </section>

          <section data-reveal className="flex min-w-0 flex-col gap-3 rounded-card bg-surface p-5 shadow-card">
            <div>
              <h2 className="font-display text-lg font-semibold text-text">Lo que va bien</h2>
              <p className="text-sm text-text-muted">Las propiedades que más interés despiertan.</p>
            </div>
            <BarList
              emptyText="Cuando lleguen las primeras visitas, acá vas a ver cuáles destacan."
              items={intel.working.slice(0, 3).map((p) => ({
                label: p.title,
                value: p.score,
                valueText: interestText(p.score),
                sublabel: p.dominant ? `Sobre todo ${p.dominant}` : undefined,
                href: `/dashboard/propiedades/${p.id}/estadisticas`,
              }))}
            />
            <Link href="/dashboard/rendimiento" className="group inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-accent">
              Ver todos los números
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </section>
        </div>
      </div>
    </DashboardReveal>
  );
}
