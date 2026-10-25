import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { mailAccess } from "@/lib/mail/access";
import { mailRuntime } from "@/lib/mail/runtime";
import { notifyAdmins } from "@/lib/notifications/create";
import { rateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * "Avisar al administrador": la inmobiliaria quiere usar el agente de correo y la plataforma todavía no lo activó. Deja una
 * notificación a los admins (una por inmobiliaria y por día) y no recibe ningún dato: no hay nada que pasarle al admin aparte
 * de este aviso. Sólo el dueño de la inmobiliaria (o el admin "viendo como").
 */
export async function POST(req: NextRequest) {
  const a = await mailAccess(req, { manage: true });
  if (a instanceof NextResponse) return a;
  // Un admin no se avisa a sí mismo: la activación está en Admin → Agentes → Correo.
  if (a.isAdmin) return NextResponse.json({ ok: true, admin: true }, { headers: NO_STORE });
  if (mailRuntime().keyReady) return NextResponse.json({ error: "El correo ya está activado: podés conectar tu casilla.", code: "already_ready" }, { status: 409, headers: NO_STORE });

  const limit = await rateLimit(`mail-setup-request:${a.agencyId}`, 3, 24 * 60 * 60, { failOpen: false });
  if (!limit.ok) return NextResponse.json({ ok: true, repeated: true }, { headers: NO_STORE });

  try {
    await connectDB();
    const agency = await Agency.findById(a.agencyId).select("name").lean();
    const day = new Date().toISOString().slice(0, 10);
    await notifyAdmins({
      type: "admin_alert",
      title: `${agency?.name ?? "Una inmobiliaria"} quiere usar el agente de correo`,
      body: "Falta activar el correo en la plataforma. Los pasos están en Agentes → Correo.",
      href: "/admin/agentes/mail",
      dedupeKey: `mail-setup:${a.agencyId}:${day}`,
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (err) {
    console.error("POST /api/dashboard/mail/request-setup failed:", (err as Error)?.message);
    return NextResponse.json({ error: "No se pudo enviar el aviso. Probá de nuevo." }, { status: 503, headers: NO_STORE });
  }
}
