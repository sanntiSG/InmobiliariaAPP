import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { agencyWithOwnerSchema } from "@/lib/validation/agency";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { User } from "@/lib/db/models/User";
import { AllowedEmail } from "@/lib/db/models/AllowedEmail";
import { slugify } from "@/lib/utils/slugify";

export async function POST(req: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = agencyWithOwnerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;

  try {
    await connectDB();

    const existingOwner = await User.findOne({ email: data.ownerEmail.toLowerCase() }).select("_id").lean();
    if (existingOwner) {
      return NextResponse.json({ error: "Ya existe una cuenta con ese email de dueño." }, { status: 409 });
    }

    let slug = slugify(data.name);
    if (await Agency.exists({ slug })) slug = `${slug}-${Date.now().toString(36)}`;

    const agency = await Agency.create({
      slug,
      name: data.name,
      description: data.description ?? "",
      contact: { whatsapp: data.whatsapp, phone: data.phone, email: data.email || undefined },
      address: { city: data.city, province: data.province, country: "Argentina" },
      status: data.status,
    });

    const passwordHash = await bcrypt.hash(data.ownerPassword, 10);
    const owner = await User.create({
      name: data.ownerName,
      email: data.ownerEmail.toLowerCase(),
      passwordHash,
      role: "agency_owner",
      agencyId: agency._id,
    });
    agency.owners = [owner._id];
    await agency.save();

    // El owner creado por contraseña también queda como fila en AllowedEmail
    // (única fuente de verdad de permisos, ver resolveAccessForEmail) — así
    // conserva su rol si más adelante inicia sesión con Google.
    await AllowedEmail.findOneAndUpdate(
      { email: owner.email },
      {
        $set: {
          agencyId: agency._id,
          role: "agency_owner",
          status: "active",
          grantedBy: admin.id,
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ id: String(agency._id), slug: agency.slug }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/agencies failed:", err);
    return NextResponse.json({ error: "No se pudo crear la inmobiliaria." }, { status: 503 });
  }
}
