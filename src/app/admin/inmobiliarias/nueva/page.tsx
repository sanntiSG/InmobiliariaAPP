import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { AgencyForm } from "@/components/admin/AgencyForm";

export const metadata = { title: "Nueva inmobiliaria" };

export default async function NewAgencyPage() {
  const admin = await requireAdminUser();
  if (!admin) redirect("/ingresar");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-bold text-text">Nueva inmobiliaria</h1>
      <AgencyForm mode="create" />
    </div>
  );
}
