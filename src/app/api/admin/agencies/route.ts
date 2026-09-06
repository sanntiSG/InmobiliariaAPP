import { NextResponse } from "next/server";
import { agencyCreateSchema } from "@/lib/validation/agency";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { slugify } from "@/lib/utils/slugify";
import { grantAgencyAccess, GrantAccessError } from "@/lib/admin/grant-agency-access";

export async function POST(req: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = agencyCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;

  let agencyId: string | null = null;
  try {
    await connectDB();
    let slug = slugify(data.name);
    if (await Agency.exists({ slug })) slug = `${slug}-${Date.now().toString(36)}`;

    // La inmobiliaria se crea primero siempre — darle acceso a un email es
    // opcional (checkbox "Darle acceso a un email ahora"). Si algo falla
    // después de este punto, se borra la inmobiliaria recién creada en vez
    // de dejar un huérfano con `owners: []`.
    const agency = await Agency.create({
      slug,
      name: data.name,
      description: data.description ?? "",
      contact: { whatsapp: data.whatsapp, phone: data.phone, email: data.email || undefined },
      address: { city: data.city, province: data.province, country: "Argentina" },
      status: data.status,
    });
    agencyId = String(agency._id);

    if (data.grantAccess) {
      await grantAgencyAccess({
        email: data.ownerEmail as string,
        agencyId,
        role: "agency_owner",
        grantedByUserId: admin.id,
        ownerName: data.ownerName || undefined,
        ownerPassword: data.ownerPassword || undefined,
      });
    }

    return NextResponse.json({ id: agencyId, slug: agency.slug }, { status: 201 });
  } catch (err) {
    if (agencyId) await Agency.deleteOne({ _id: agencyId });
    if (err instanceof GrantAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/admin/agencies failed:", err);
    return NextResponse.json({ error: "No se pudo crear la inmobiliaria." }, { status: 503 });
  }
}
