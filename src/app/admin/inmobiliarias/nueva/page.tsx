import { AgencyForm } from "@/components/admin/AgencyForm";

export const metadata = { title: "Nueva inmobiliaria" };

export default function NewAgencyPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-bold text-text">Nueva inmobiliaria</h1>
      <AgencyForm mode="create" />
    </div>
  );
}
