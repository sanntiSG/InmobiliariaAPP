import { redirect } from "next/navigation";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { PropertyForm } from "@/components/dashboard/PropertyForm";

export const metadata = { title: "Nueva propiedad" };

export default async function NewPropertyPage() {
  const access = await requireDashboardAccess();
  if (!access) redirect("/ingresar");

  let agencies: { id: string; name: string }[] | undefined;
  if (access.isAdmin) {
    await connectDB();
    const docs = await Agency.find({}).select("name").sort({ name: 1 }).lean();
    agencies = docs.map((a) => ({ id: String(a._id), name: a.name }));
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-bold text-text">Nueva propiedad</h1>
      <PropertyForm mode="create" agencies={agencies} />
    </div>
  );
}
