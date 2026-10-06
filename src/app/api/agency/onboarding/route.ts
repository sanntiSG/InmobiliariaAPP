import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { User } from "@/lib/db/models/User";
import { AllowedEmail } from "@/lib/db/models/AllowedEmail";
import { onboardingAgencySchema } from "@/lib/validation/agency";
import { slugify } from "@/lib/utils/slugify";
import { limitOr429 } from "@/lib/security/rate-limit";

/**
 * Alta de inmobiliaria por el propio usuario ya habilitado por el admin
 * (AllowedEmail con `agencyId: null` — ver `resolveAccessForEmail`). Requiere
 * estar logueado con rol de agencia y sin inmobiliaria asignada todavía.
 *
 * El rol y la agencia se confirman contra la base, no contra el JWT: el token
 * puede estar desactualizado hasta 5 minutos (ver `ROLE_REFRESH_INTERVAL_MS`),
 * y con eso un doble envío —o un permiso recién revocado— pasaba el control.
 */
export async function POST(req: Request) {
  const session = await auth().catch(() => null);
  const sessionUser = session?.user;
  if (!sessionUser?.id) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });

  const limited = await limitOr429(req, "onboarding", 5, 60 * 60, { userId: sessionUser.id, failOpen: false });
  if (limited) return limited;

  const parsed = onboardingAgencySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;

  try {
    await connectDB();

    const user = await User.findById(sessionUser.id).select("role agencyId email").lean();
    if (!user || (user.role !== "agency_owner" && user.role !== "agency_agent")) {
      return NextResponse.json({ error: "No tenés permiso para crear una inmobiliaria." }, { status: 403 });
    }
    if (user.agencyId) {
      return NextResponse.json({ error: "Ya tenés una inmobiliaria asignada." }, { status: 409 });
    }

    let slug = slugify(data.name);
    if (await Agency.exists({ slug })) slug = `${slug}-${Date.now().toString(36)}`;

    // Reserva atómica: sólo gana quien pasa `agencyId` de null a la nueva agencia.
    // Dos envíos simultáneos no pueden crear dos inmobiliarias para la misma persona.
    const agency = await Agency.create({
      slug,
      name: data.name,
      description: data.description ?? "",
      contact: { whatsapp: data.whatsapp, phone: data.phone, email: data.email || undefined },
      address: { city: data.city, province: data.province, country: "Argentina" },
      status: "active",
      owners: [user._id],
    });
    const claimed = await User.updateOne({ _id: user._id, agencyId: null }, { $set: { agencyId: agency._id } });
    if (claimed.modifiedCount === 0) {
      await Agency.deleteOne({ _id: agency._id });
      return NextResponse.json({ error: "Ya tenés una inmobiliaria asignada." }, { status: 409 });
    }

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
