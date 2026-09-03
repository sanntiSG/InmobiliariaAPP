import Link from "next/link";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { Property } from "@/lib/db/models/Property";
import { buttonClasses } from "@/components/ui/Button";
import { DeleteAgencyButton } from "@/components/admin/DeleteAgencyButton";
import { AGENCY_STATUS_LABELS } from "@/lib/validation/agency";
import { cn } from "@/lib/utils/cn";

export const metadata = { title: "Admin — Inmobiliarias" };

export default async function AdminPage() {
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
        <Link href="/admin/inmobiliarias/nueva" className={buttonClasses("primary", "md")}>
          + Nueva inmobiliaria
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
