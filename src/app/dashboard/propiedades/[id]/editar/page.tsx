import { redirect, notFound } from "next/navigation";
import { Types } from "mongoose";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { Property } from "@/lib/db/models/Property";
import { PropertyForm, type PropertyFormValues } from "@/components/dashboard/PropertyForm";

export const metadata = { title: "Editar propiedad" };

export default async function EditPropertyPage({ params }: PageProps<"/dashboard/propiedades/[id]/editar">) {
  const access = await requireDashboardAccess();
  if (!access) redirect("/ingresar");

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  await connectDB();
  const scopeQuery = access.isAdmin ? { _id: id } : { _id: id, agencyId: access.agencyId };
  const doc = await Property.findOne(scopeQuery).lean();
  if (!doc) notFound();

  let agencies: { id: string; name: string }[] | undefined;
  if (access.isAdmin) {
    const docs = await Agency.find({}).select("name").sort({ name: 1 }).lean();
    agencies = docs.map((a) => ({ id: String(a._id), name: a.name }));
  }

  const [lng, lat] = doc.location.coordinates as [number, number];

  const initialValues: PropertyFormValues = {
    agencyId: String(doc.agencyId),
    title: doc.title,
    description: doc.description ?? "",
    operation: doc.operation,
    type: doc.type,
    status: doc.status,
    priceAmount: String(doc.price!.amount),
    currency: doc.price!.currency ?? "USD",
    expenses: doc.price!.expenses ? String(doc.price!.expenses) : "",
    period: (doc.price!.period ?? "total") as "total" | "mensual",
    street: doc.address?.street ?? "",
    number: doc.address?.number ?? "",
    neighborhood: doc.address?.neighborhood ?? "",
    city: doc.address?.city ?? "",
    province: doc.address?.province ?? "",
    showExact: doc.address?.showExact !== false,
    lng,
    lat,
    rooms: doc.features?.rooms != null ? String(doc.features.rooms) : "",
    bedrooms: doc.features?.bedrooms != null ? String(doc.features.bedrooms) : "",
    bathrooms: doc.features?.bathrooms != null ? String(doc.features.bathrooms) : "",
    garages: doc.features?.garages != null ? String(doc.features.garages) : "",
    coveredArea: doc.features?.coveredArea != null ? String(doc.features.coveredArea) : "",
    totalArea: doc.features?.totalArea != null ? String(doc.features.totalArea) : "",
    age: doc.features?.age != null ? String(doc.features.age) : "",
    floor: doc.features?.floor != null ? String(doc.features.floor) : "",
    orientation: doc.features?.orientation ?? "",
    amenities: (doc.amenities ?? []) as PropertyFormValues["amenities"],
    images: (doc.media?.images ?? []).map((img, i) => ({
      url: img.url,
      alt: img.alt ?? "",
      order: img.order ?? i,
      providerId: img.providerId ?? undefined,
    })),
    tourEnabled: !!doc.media?.tour3d?.enabled,
    tourUrl: doc.media?.tour3d?.meshUrl ?? doc.media?.tour3d?.embedUrl ?? "",
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-bold text-text">Editar propiedad</h1>
      <PropertyForm mode="edit" propertyId={String(doc._id)} initialValues={initialValues} agencies={agencies} />
    </div>
  );
}
