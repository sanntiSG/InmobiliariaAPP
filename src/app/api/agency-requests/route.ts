import { NextRequest, NextResponse, after } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { AgencyRequest } from "@/lib/db/models/AgencyRequest";
import { AllowedEmail } from "@/lib/db/models/AllowedEmail";
import { User } from "@/lib/db/models/User";
import { requireUser } from "@/lib/auth/require-user";
import { agencyRequestSchema } from "@/lib/validation/agency-request";
import { rateLimit } from "@/lib/security/rate-limit";
import { notifyAdmins } from "@/lib/notifications/create";

/**
 * Una persona con cuenta pide permiso para gestionar una inmobiliaria. El
 * proceso por WhatsApp se mantiene: esto agrega el registro y el aviso
 * interno al admin (que después aprueba o rechaza desde /admin/solicitudes).
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });

  const parsed = agencyRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  // Honeypot: respondemos como si hubiera funcionado, sin guardar nada.
  if (parsed.data.website) return NextResponse.json({ ok: true }, { status: 201 });

  const limit = await rateLimit(`agency-request:${user.id}`, 5, 60 * 60, { failOpen: false });
  if (!limit.ok) {
    return NextResponse.json({ error: "Demasiados intentos. Probá de nuevo más tarde." }, { status: 429 });
  }

  try {
    await connectDB();

    const dbUser = await User.findById(user.id).select("name email role").lean();
    if (!dbUser) return NextResponse.json({ error: "Cuenta no encontrada." }, { status: 404 });
    if (dbUser.role !== "user") {
      return NextResponse.json({ error: "Tu cuenta ya tiene permisos para gestionar una inmobiliaria." }, { status: 409 });
    }
    if (await AllowedEmail.exists({ email: dbUser.email })) {
      return NextResponse.json({ error: "Ya tenés un permiso concedido por el admin." }, { status: 409 });
    }

    let request;
    try {
      request = await AgencyRequest.create({
        userId: dbUser._id,
        email: dbUser.email,
        name: dbUser.name,
        agencyName: parsed.data.agencyName,
        phone: parsed.data.phone,
        zone: parsed.data.zone,
        message: parsed.data.message ?? "",
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        return NextResponse.json({ error: "Ya tenés una solicitud en revisión." }, { status: 409 });
      }
      throw err;
    }

    after(() =>
      notifyAdmins({
        type: "agency_request",
        title: "Un usuario solicitó permiso para crear/gestionar una inmobiliaria.",
        body: `${dbUser.name} · ${parsed.data.agencyName} · ${parsed.data.zone}`,
        href: "/admin/solicitudes",
        dedupeKey: `agency_request:${request._id}`,
      })
    );

    return NextResponse.json({ ok: true, id: String(request._id) }, { status: 201 });
  } catch (err) {
    console.error("POST /api/agency-requests failed:", err);
    return NextResponse.json({ error: "No se pudo enviar la solicitud. Intentá de nuevo." }, { status: 503 });
  }
}
