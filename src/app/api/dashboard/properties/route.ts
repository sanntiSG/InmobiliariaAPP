import { NextResponse } from "next/server";
import { propertyInputSchema } from "@/lib/validation/property";
import { requireAgencyUser } from "@/lib/auth/require-agency-user";
import { connectDB } from "@/lib/db/connect";
import { Property } from "@/lib/db/models/Property";
import { slugify } from "@/lib/utils/slugify";

const createSchema = propertyInputSchema.omit({ agencyId: true });

export async function POST(req: Request) {
  const agencyUser = await requireAgencyUser();
  if (!agencyUser) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    await connectDB();
    const data = parsed.data;
    const slug = `${slugify(data.title)}-${Date.now().toString(36)}`;

    const property = await Property.create({
      ...data,
      agencyId: agencyUser.agencyId,
      slug,
      location: { type: "Point", coordinates: data.location },
      priceHistory: [{ amount: data.price.amount, currency: data.price.currency, changedAt: new Date() }],
      publishedAt: data.status === "published" ? new Date() : undefined,
    });

    return NextResponse.json({ id: String(property._id), slug: property.slug }, { status: 201 });
  } catch (err) {
    console.error("POST /api/dashboard/properties failed:", err);
    return NextResponse.json({ error: "No se pudo crear la propiedad." }, { status: 503 });
  }
}
