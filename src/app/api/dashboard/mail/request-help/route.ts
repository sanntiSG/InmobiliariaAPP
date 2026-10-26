import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { mailAccess } from "@/lib/mail/access";
import { appPasswordName } from "@/lib/mail/presets";
import { notifyAdmins } from "@/lib/notifications/create";
import { rateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const bodySchema = z.object({ email: z.string().trim().toLowerCase().email().max(160).optional() });

/**
 * "Pedir ayuda al administrador" desde el asistente de conexión: la inmobiliaria no pudo (o prefiere no) crear la contraseña de
 * aplicación sola. El aviso lleva el NOMBRE DE LA INMOBILIARIA y el nombre con el que debería haber creado la contraseña, y
 * un enlace directo para conectarle la casilla "viendo como". No recibe ninguna contraseña: eso se manda por WhatsApp.
 */
export async function POST(req: NextRequest) {
  const a = await mailAccess(req, { manage: true });
  if (a instanceof NextResponse) return a;
  // Un admin no se avisa a sí mismo: ya está conectando por la inmobiliaria.
  if (a.isAdmin) return NextResponse.json({ ok: true, admin: true }, { headers: NO_STORE });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Revisá el email." }, { status: 400, headers: NO_STORE });

  const limit = await rateLimit(`mail-help-request:${a.agencyId}`, 3, 24 * 60 * 60, { failOpen: false });
  if (!limit.ok) return NextResponse.json({ ok: true, repeated: true }, { headers: NO_STORE });

  try {
    await connectDB();
    const agency = await Agency.findById(a.agencyId).select("name").lean();
    const name = agency?.name ?? "Una inmobiliaria";
    const day = new Date().toISOString().slice(0, 10);
    await notifyAdmins({
      type: "admin_alert",
      title: `${name} necesita ayuda para conectar su correo`,
      body: `${parsed.data.email ? `Casilla: ${parsed.data.email}. ` : ""}Pedile la contraseña de aplicación «${appPasswordName(name)}» y conectala “viendo como”.`.slice(0, 280),
      href: `/dashboard/agentes/correo?agencyId=${a.agencyId}`,
      dedupeKey: `mail-help:${a.agencyId}:${day}`,
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (err) {
    console.error("POST /api/dashboard/mail/request-help failed:", (err as Error)?.message);
    return NextResponse.json({ error: "No se pudo enviar el aviso. Probá de nuevo." }, { status: 503, headers: NO_STORE });
  }
}
