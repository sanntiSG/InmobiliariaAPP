import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { User } from "@/lib/db/models/User";
import { AllowedEmail } from "@/lib/db/models/AllowedEmail";
import { onboardingAgencySchema } from "@/lib/validation/agency";
import { slugify } from "@/lib/utils/slugify";

/**
 * Alta de inmobiliaria por el propio usuario ya habilitado por el admin
 * (AllowedEmail con `agencyId: null` — ver `resolveAccessForEmail`). Requiere
 * estar logueado con rol de agencia y sin inmobiliaria asignada todavía.
 */
export async function POST(req: Request) {
  const session = await auth().catch(() => null);
  const user = session?.user;
  if (!user?.id) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });

  if (user.role !== "agency_owner" && user.role !== "agency_agent") {
    return NextResponse.json({ error: "No tenés permiso para crear una inmobiliaria." }, { status: 403 });
  }
  if (user.agencyId) {
    return NextResponse.json({ error: "Ya tenés una inmobiliaria asignada." }, { status: 409 });
  }

  const parsed = onboardingAgencySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;

  try {
    await connectDB();

    let slug = slugify(data.name);
    if (await Agency.exists({ slug })) slug = `${slug}-${Date.now().toString(36)}`;

    const agency = await Agency.create({
      slug,
      name: data.name,
      description: data.description ?? "",
      contact: { whatsapp: data.whatsapp, phone: data.phone, email: data.email || undefined },
      address: { city: data.city, province: data.province, country: "Argentina" },
      status: "active",
      owners: [user.id],
    });

    await User.updateOne({ _id: user.id }, { $set: { agencyId: agency._id } });

    if (user.email) {
      await AllowedEmail.updateOne(
        { email: user.email.toLowerCase() },
        { $set: { agencyId: agency._id, status: "active" } }
      );
    }

    return NextResponse.json({ id: String(agency._id), slug: agency.slug }, { status: 201 });
  } catch (err) {
    console.error("POST /api/agency/onboarding failed:", err);
    return NextResponse.json({ error: "No se pudo crear la inmobiliaria." }, { status: 503 });
  }
}
