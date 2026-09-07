import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Types } from "mongoose";
import { Plus } from "lucide-react";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { AllowedEmail } from "@/lib/db/models/AllowedEmail";
import { AgencyForm, type AgencyFormValues } from "@/components/admin/AgencyForm";
import { AllowedEmailsManager } from "@/components/admin/AllowedEmailsManager";
import { buttonClasses } from "@/components/ui/Button";

export const metadata = { title: "Editar inmobiliaria" };

export default async function EditAgencyPage({ params }: PageProps<"/admin/inmobiliarias/[id]/editar">) {
  const admin = await requireAdminUser();
  if (!admin) redirect("/ingresar");

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  await connectDB();
  const [agency, allowedEmails] = await Promise.all([
    Agency.findById(id).lean(),
    AllowedEmail.find({ agencyId: id }).sort({ createdAt: -1 }).populate("agencyId", "name slug").lean(),
  ]);
  if (!agency) notFound();

  const initialValues: AgencyFormValues = {
    name: agency.name,
    description: agency.description ?? "",
    whatsapp: agency.contact?.whatsapp ?? "",
    phone: agency.contact?.phone ?? "",
    email: agency.contact?.email ?? "",
    city: agency.address?.city ?? "",
    province: agency.address?.province ?? "",
    status: agency.status as AgencyFormValues["status"],
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-text">Editar inmobiliaria</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/dashboard/propiedades?agencyId=${agency._id}`}
            className={buttonClasses("secondary", "sm")}
          >
            Ver propiedades
          </Link>
          <Link
            href={`/dashboard/propiedades/nueva?agencyId=${agency._id}`}
            className={buttonClasses("primary", "sm", "inline-flex items-center gap-1.5")}
          >
            <Plus className="h-4 w-4" aria-hidden /> Nueva propiedad
          </Link>
        </div>
      </div>
      <AgencyForm mode="edit" agencyId={String(agency._id)} initialValues={initialValues} />

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold text-text">Accesos de esta inmobiliaria</h2>
        <AllowedEmailsManager
          lockedAgencyId={String(agency._id)}
          initialEmails={allowedEmails.map((entry) => {
            const entryAgency = entry.agencyId as unknown as { _id: string; name: string; slug: string } | null;
            return {
              _id: String(entry._id),
              email: entry.email,
              status: entry.status as "pending" | "awaiting_agency" | "active",
              agencyId: entryAgency
                ? { _id: String(entryAgency._id), name: entryAgency.name, slug: entryAgency.slug }
                : null,
              createdAt: (entry.createdAt as Date).toISOString(),
            };
          })}
          agencies={[]}
        />
      </div>
    </div>
  );
}
