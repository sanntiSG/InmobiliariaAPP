import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { agencyScope } from "@/lib/auth/agency-scope";
import { agencyProfileSchema } from "@/lib/validation/agency";

/**
 * La inmobiliaria edita SU perfil (o el admin el de la que elija). Sólo toca
 * datos de presentación: nunca `status`, `owners` ni `slug`.
 */
export async function PATCH(req: Request) {
  const access = await requireDashboardAccess();
  if (!access) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });
  if (access.needsOnboarding) return NextResponse.json({ error: "Primero creá tu inmobiliaria." }, { status: 403 });

  const parsed = agencyProfileSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const { agencyId: requested, ...data } = parsed.data;

  // Dueño/agente: siempre su propia agencia (el agencyId del body se ignora). Admin: la elegida.
  const scope = agencyScope(access, requested);
  if (!scope?.agencyId) {
    return NextResponse.json({ error: "Elegí una inmobiliaria." }, { status: 400 });
  }

  try {
    await connectDB();
    const update: Record<string, unknown> = {
      name: data.name,
      description: data.description ?? "",
      "contact.whatsapp": data.whatsapp,
      "contact.phone": data.phone ?? "",
      "contact.email": data.email ?? "",
      "contact.website": data.website ?? "",
      "address.city": data.city,
      "address.province": data.province ?? "",
    };
    if (data.logo !== undefined) update.logo = data.logo || null;
    if (data.cover !== undefined) update.cover = data.cover || null;

    const agency = await Agency.findOneAndUpdate({ _id: scope.agencyId }, { $set: update }, { new: true })
      .select("slug")
      .lean();
    if (!agency) return NextResponse.json({ error: "Inmobiliaria no encontrada." }, { status: 404 });

    return NextResponse.json({ ok: true, slug: agency.slug });
  } catch (err) {
    console.error("PATCH /api/dashboard/agency failed:", err);
    return NextResponse.json({ error: "No se pudo guardar el perfil." }, { status: 503 });
  }
}
