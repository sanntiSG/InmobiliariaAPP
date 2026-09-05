import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Types } from "mongoose";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { AgencyForm, type AgencyFormValues } from "@/components/admin/AgencyForm";
import { buttonClasses } from "@/components/ui/Button";

export const metadata = { title: "Editar inmobiliaria" };

export default async function EditAgencyPage({ params }: PageProps<"/admin/inmobiliarias/[id]/editar">) {
  const admin = await requireAdminUser();
  if (!admin) redirect("/ingresar");

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  await connectDB();
  const agency = await Agency.findById(id).lean();
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
    ownerName: "",
    ownerEmail: "",
    ownerPassword: "",
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
            className={buttonClasses("primary", "sm")}
          >
            + Nueva propiedad
          </Link>
        </div>
      </div>
      <AgencyForm mode="edit" agencyId={String(agency._id)} initialValues={initialValues} />
    </div>
  );
}
