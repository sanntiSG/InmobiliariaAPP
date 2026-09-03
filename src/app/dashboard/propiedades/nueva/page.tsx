import { redirect } from "next/navigation";
import { requireAgencyUser } from "@/lib/auth/require-agency-user";
import { PropertyForm } from "@/components/dashboard/PropertyForm";

export const metadata = { title: "Nueva propiedad" };

export default async function NewPropertyPage() {
  const agencyUser = await requireAgencyUser();
  if (!agencyUser) redirect("/ingresar");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-bold text-text">Nueva propiedad</h1>
      <PropertyForm mode="create" />
    </div>
  );
}
