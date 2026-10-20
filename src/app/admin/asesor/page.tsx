import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { connectDB } from "@/lib/db/connect";
import { AdvisorUnmatched } from "@/lib/db/models/AdvisorUnmatched";
import { getAdminConfigState } from "@/lib/advisor/config";
import { requireFreshAdmin } from "@/lib/auth/require-fresh-admin";
import { AdvisorStudio } from "@/components/admin/advisor/AdvisorStudio";
import type { UnmatchedRow } from "@/app/api/admin/advisor/unmatched/route";

export const metadata: Metadata = { title: "Asesor" };
export const dynamic = "force-dynamic";

export default async function AdvisorStudioPage() {
  const admin = await requireFreshAdmin();
  if (!admin) redirect("/ingresar");

  await connectDB();
  const [state, rows] = await Promise.all([
    getAdminConfigState(),
    AdvisorUnmatched.find({}).sort({ count: -1, lastAt: -1 }).limit(100).lean(),
  ]);
  const unmatched: UnmatchedRow[] = rows.map((r) => ({
    id: String(r._id),
    text: r.text,
    mode: r.mode,
    kind: r.kind,
    count: r.count ?? 1,
    lastAt: new Date(r.lastAt).toISOString(),
  }));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-text">Asesor</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          Ponele nombre, elegí su modelo 3D y cuándo usa cada animación. Trabajás sobre un borrador: lo probás y recién cuando publicás lo ve la gente.
        </p>
      </header>
      <AdvisorStudio initial={state} unmatched={unmatched} />
    </div>
  );
}
