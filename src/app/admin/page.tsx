import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { Property } from "@/lib/db/models/Property";
import { buttonClasses } from "@/components/ui/Button";
import { DeleteAgencyButton } from "@/components/admin/DeleteAgencyButton";
import { AGENCY_STATUS_LABELS } from "@/lib/validation/agency";
import { cn } from "@/lib/utils/cn";

export const metadata = { title: "Admin — Inmobiliarias" };

export default async function AdminPage() {
  const admin = await requireAdminUser();
  if (!admin) redirect("/ingresar");

  await connectDB();
  const agencies = await Agency.find({}).sort({ createdAt: -1 }).lean();
  const counts = await Property.aggregate([{ $group: { _id: "$agencyId", count: { $sum: 1 } } }]);
  const countByAgency = new Map(counts.map((c) => [String(c._id), c.count]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-text">Inmobiliarias</h1>
          <p className="text-sm text-text-muted">{agencies.length} inmobiliaria(s) en la plataforma.</p>
        </div>
        <Link
          href="/admin/inmobiliarias/nueva"
          className={buttonClasses("primary", "md", "inline-flex items-center gap-1.5")}
        >
          <Plus className="h-4 w-4" aria-hidden /> Nueva inmobiliaria
        </Link>
      </div>

      {agencies.length === 0 ? (
        <div className="rounded-card bg-surface p-10 text-center shadow-card">
          <p className="text-text-muted">Todavía no hay inmobiliarias dadas de alta.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card bg-surface shadow-card">
          {agencies.map((a, i) => (
            <div
              key={String(a._id)}
              className={cn("flex items-center gap-4 px-5 py-4", i > 0 && "border-t border-border")}
            >
              <div className="min-w-0 flex-1">
                <Link href={`/admin/inmobiliarias/${a._id}/editar`} className="font-medium text-text hover:underline">
                  {a.name}
                </Link>
                <p className="text-sm text-text-muted">
                  {a.address?.city ?? "—"} · {countByAgency.get(String(a._id)) ?? 0} propiedades ·{" "}
                  {a.contact?.whatsapp ?? "sin WhatsApp"}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                  <Link
                    href={`/dashboard/propiedades?agencyId=${a._id}`}
                    className="text-sm font-medium text-accent hover:underline"
                  >
                    Ver propiedades
                  </Link>
                  <Link
                    href={`/dashboard/propiedades/nueva?agencyId=${a._id}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden /> Propiedad
                  </Link>
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-pill px-2.5 py-1 text-xs font-medium",
                  a.status === "active" && "bg-success-soft text-success",
                  a.status === "suspended" && "bg-danger-soft text-danger",
                  a.status === "pending" && "bg-warning-soft text-warning"
                )}
              >
                {AGENCY_STATUS_LABELS[a.status as keyof typeof AGENCY_STATUS_LABELS] ?? a.status}
              </span>
              <DeleteAgencyButton agencyId={String(a._id)} name={a.name} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
