import Link from "next/link";
import { redirect } from "next/navigation";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { connectDB } from "@/lib/db/connect";
import { Property } from "@/lib/db/models/Property";
import { buttonClasses } from "@/components/ui/Button";
import { DeletePropertyButton } from "@/components/dashboard/DeletePropertyButton";
import { formatPrice } from "@/lib/utils/format";
import { PROPERTY_STATUS_LABELS, type PropertyStatus } from "@/config/filters";

export const metadata = { title: "Propiedades" };

export default async function DashboardPropertiesPage() {
  const access = await requireDashboardAccess();
  if (!access) redirect("/ingresar");

  await connectDB();
  const query = access.isAdmin ? {} : { agencyId: access.agencyId };
  let propertiesQuery = Property.find(query)
    .select("title slug status price stats media.images agencyId")
    .sort({ updatedAt: -1 });
  if (access.isAdmin) {
    propertiesQuery = propertiesQuery.populate({ path: "agencyId", select: "name" });
  }
  const properties = await propertiesQuery.lean();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-text">
          {access.isAdmin ? "Todas las propiedades" : "Mis propiedades"}{" "}
          <span className="text-text-muted">({properties.length})</span>
        </h1>
        <Link href="/dashboard/propiedades/nueva" className={buttonClasses("primary", "md")}>
          + Nueva propiedad
        </Link>
      </div>

      {properties.length === 0 ? (
        <div className="rounded-card bg-surface p-10 text-center shadow-card">
          <p className="text-text-muted">Todavía no hay propiedades cargadas.</p>
          <Link href="/dashboard/propiedades/nueva" className={buttonClasses("primary", "md", "mt-4 inline-flex")}>
            Cargar la primera
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card bg-surface shadow-card">
          {properties.map((p, i) => {
            const agency = access.isAdmin ? (p.agencyId as unknown as { name?: string } | null) : null;
            return (
              <div
                key={String(p._id)}
                className={`flex items-center gap-4 px-5 py-3.5 hover:bg-surface-2 ${i > 0 ? "border-t border-border" : ""}`}
              >
                <div className="h-12 w-16 shrink-0 overflow-hidden rounded-media bg-surface-2">
                  {p.media?.images?.[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.media.images[0].url} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <Link href={`/dashboard/propiedades/${p._id}/editar`} className="min-w-0 flex-1">
                  <p className="truncate font-medium text-text">{p.title}</p>
                  <p className="text-sm text-text-muted">
                    {formatPrice(p.price!.amount, p.price!.currency)} · {p.stats?.views ?? 0} vistas ·{" "}
                    {p.stats?.likes ?? 0} likes{agency?.name ? ` · ${agency.name}` : ""}
                  </p>
                </Link>
                <span className="hidden shrink-0 rounded-pill bg-surface-2 px-2.5 py-1 text-xs font-medium text-text-muted sm:inline-block">
                  {PROPERTY_STATUS_LABELS[p.status as PropertyStatus] ?? p.status}
                </span>
                <DeletePropertyButton propertyId={String(p._id)} title={p.title} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
