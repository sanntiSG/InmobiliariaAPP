import { redirect, notFound } from "next/navigation";
import { Types } from "mongoose";
import { requireAgencyUser } from "@/lib/auth/require-agency-user";
import { connectDB } from "@/lib/db/connect";
import { Property } from "@/lib/db/models/Property";
import { PropertyForm, type PropertyFormValues } from "@/components/dashboard/PropertyForm";

export const metadata = { title: "Editar propiedad" };

export default async function EditPropertyPage({ params }: PageProps<"/dashboard/propiedades/[id]/editar">) {
  const agencyUser = await requireAgencyUser();
  if (!agencyUser) redirect("/ingresar");

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  await connectDB();
  const doc = await Property.findOne({ _id: id, agencyId: agencyUser.agencyId }).lean();
  if (!doc) notFound();

  const [lng, lat] = doc.location.coordinates as [number, number];

  const initialValues: PropertyFormValues = {
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
    tourKind: (doc.media?.tour3d?.kind as PropertyFormValues["tourKind"]) ?? "iframe",
    tourEmbedUrl: doc.media?.tour3d?.embedUrl ?? "",
    tourMesh:
      doc.media?.tour3d?.meshUrl && doc.media.tour3d.meshFormat
        ? { url: doc.media.tour3d.meshUrl, format: doc.media.tour3d.meshFormat as "glb" | "gltf" | "usdz" }
        : null,
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-bold text-text">Editar propiedad</h1>
      <PropertyForm mode="edit" propertyId={String(doc._id)} initialValues={initialValues} />
    </div>
  );
}
