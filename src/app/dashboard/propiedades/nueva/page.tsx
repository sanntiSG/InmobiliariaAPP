import Link from "next/link";
import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { PropertyForm } from "@/components/dashboard/PropertyForm";
import { buttonClasses } from "@/components/ui/Button";

export const metadata = { title: "Nueva propiedad" };

export default async function NewPropertyPage({
  searchParams,
}: PageProps<"/dashboard/propiedades/nueva">) {
  const access = await requireDashboardAccess();
  if (!access) redirect("/ingresar");

  let agencies: { id: string; name: string }[] | undefined;
  let initialAgencyId: string | undefined;

  if (access.isAdmin) {
    await connectDB();
    const docs = await Agency.find({}).select("name").sort({ name: 1 }).lean();
    agencies = docs.map((a) => ({ id: String(a._id), name: a.name }));

    if (agencies.length === 0) {
      return (
        <div className="flex flex-col items-center gap-4 rounded-card bg-surface p-10 text-center shadow-card">
          <p className="text-text-muted">Todavía no hay inmobiliarias en la plataforma.</p>
          <Link href="/admin/inmobiliarias/nueva" className={buttonClasses("primary", "md")}>
            Crear la primera inmobiliaria
          </Link>
        </div>
      );
    }

    // Preselecciona la inmobiliaria si se llegó desde "+ Propiedad" en /admin.
    const params = (await searchParams) as { agencyId?: string } | undefined;
    const requested = params?.agencyId?.trim();
    if (requested && Types.ObjectId.isValid(requested) && agencies.some((a) => a.id === requested)) {
      initialAgencyId = requested;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-bold text-text">Nueva propiedad</h1>
      <PropertyForm mode="create" agencies={agencies} initialAgencyId={initialAgencyId} />
    </div>
  );
}
