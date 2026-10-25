import { NextResponse, after, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { logActivity } from "@/lib/activity/log";
import { connectDB } from "@/lib/db/connect";
import { Mailbox } from "@/lib/db/models/Mailbox";
import { MailMessage } from "@/lib/db/models/MailMessage";
import { MailSettings } from "@/lib/db/models/MailSettings";
import { mailAccess } from "@/lib/mail/access";
import { mainSiteUrl } from "@/lib/mail/heartbeat";
import { getOverview } from "@/lib/mail/overview";
import { PRESETS } from "@/lib/mail/presets";
import { mailRuntime } from "@/lib/mail/runtime";
import { explain, testConnection } from "@/lib/mail/transport";
import { limitOr429, rateLimit } from "@/lib/security/rate-limit";
import { mailboxAad, secretBox } from "@/lib/security/secret-box";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const server = z.object({ host: z.string().trim().min(3).max(200), port: z.number().int().min(1).max(65535) });
const bodySchema = z.object({
  provider: z.enum(["gmail", "yahoo", "icloud", "custom"]),
  email: z.string().trim().toLowerCase().email().max(160),
  // Las contraseñas de aplicación suelen mostrarse con espacios (xxxx xxxx xxxx xxxx): se quitan.
  password: z
    .string()
    .transform((s) => s.replace(/\s+/g, ""))
    .pipe(z.string().min(6).max(128)),
  imap: server.optional(),
  smtp: server.optional(),
  /** La persona aceptó el aviso de qué se lee y cuánto se guarda. */
  consent: z.literal(true),
});

const fail = (error: string, status: number, code?: string) => NextResponse.json({ error, code }, { status, headers: { "Cache-Control": "no-store" } });

/** Conecta (o reconecta) el buzón de la inmobiliaria. Sólo el dueño o el admin. Prueba la conexión antes de guardar nada. */
export async function POST(req: NextRequest) {
  const a = await mailAccess(req, { manage: true });
  if (a instanceof NextResponse) return a;

  // Antes de gastar intentos: ¿esta web puede conectar casillas? (si no, se dice qué hacer en vez de fallar al final)
  const runtime = mailRuntime();
  if (!runtime.keyReady) return fail("El correo todavía no está activado en la plataforma. Avisale a quien la administra.", 503, "not_ready");
  if (!runtime.sender) {
    const main = await mainSiteUrl();
    return NextResponse.json(
      {
        error: main ? "Esta es la web de respaldo y desde acá no se puede conectar la casilla. Entrá desde la web principal y conectala ahí." : "Desde esta web no se puede conectar la casilla. Entrá desde la web principal.",
        code: "use_main",
        mainSiteUrl: main,
      },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Freno anti-abuso (probar contraseñas ajenas): por persona y por inmobiliaria; si el contador falla, no se deja pasar.
  const limited = await limitOr429(req, "mail-connect", 6, 60 * 60, { userId: a.userId, failOpen: false });
  if (limited) return limited;
  const perAgency = await rateLimit(`mail-connect:agency:${a.agencyId}`, 12, 24 * 60 * 60, { failOpen: false });
  if (!perAgency.ok) return fail("Se probó demasiadas veces hoy. Esperá y volvé a intentar mañana.", 429);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Revisá los datos: el email, la contraseña y aceptar el aviso son obligatorios.", 400);
  const { provider, email, password, consent: _consent } = parsed.data;
  void _consent;

  const preset = provider === "custom" ? null : PRESETS[provider];
  const imap = preset?.imap ?? parsed.data.imap;
  const smtp = preset?.smtp ?? parsed.data.smtp;
  if (!imap || !smtp) return fail("Completá los servidores de entrada y de salida.", 400);

  let info;
  try {
    info = await testConnection({ provider, email, password, imap, smtp });
  } catch (err) {
    const e = explain(err);
    return fail(e.message, e.code === "auth" ? 401 : e.code === "host" ? 400 : 502, e.code);
  }

  try {
    await connectDB();
    const existing = await Mailbox.findOne({ agencyId: a.agencyId }).select("_id email").lean();
    const id = existing?._id ?? new Types.ObjectId();
    const now = new Date();
    await Mailbox.updateOne(
      { _id: id },
      {
        $set: {
          provider,
          email,
          imap,
          smtp,
          // La contraseña se cifra atada a ESTE buzón de ESTA inmobiliaria.
          secret: secretBox.seal(password, mailboxAad(a.agencyId, String(id))),
          status: "active",
          lastError: null,
          failCount: 0,
          // Se lee sólo lo que llegue desde ahora: el historial de la casilla no se toca.
          uidValidity: info.uidValidity,
          lastUid: Math.max(0, info.uidNext - 1),
          lockedUntil: null,
          nextPollAt: now,
          connectedBy: a.userId,
          consentAt: now,
        },
        $setOnInsert: { agencyId: a.agencyId },
      },
      { upsert: true }
    );
    // Si cambió de casilla, lo guardado de la anterior ya no corresponde.
    if (existing && existing.email !== email) await MailMessage.deleteMany({ agencyId: a.agencyId });
    await MailSettings.updateOne({ agencyId: a.agencyId }, { $setOnInsert: { agencyId: a.agencyId } }, { upsert: true });

    after(() => logActivity({ agencyId: a.agencyId, actorId: a.userId, actorRole: a.role, kind: "mail_connected" }));
    return NextResponse.json(await getOverview(a.agencyId, a.canManage, a.isAdmin), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("POST /api/dashboard/mail/connect failed:", (err as Error)?.message);
    return fail("No se pudo guardar la conexión. Probá de nuevo.", 503);
  }
}

/** Desconecta el buzón: se borran la contraseña y TODOS los mails guardados de la inmobiliaria. Los clientes que ya se anotaron quedan. */
export async function DELETE(req: NextRequest) {
  const a = await mailAccess(req, { manage: true });
  if (a instanceof NextResponse) return a;
  const limited = await limitOr429(req, "mail-disconnect", 20, 60 * 60, { userId: a.userId });
  if (limited) return limited;
  try {
    await connectDB();
    await Promise.all([Mailbox.deleteOne({ agencyId: a.agencyId }), MailMessage.deleteMany({ agencyId: a.agencyId })]);
    after(() => logActivity({ agencyId: a.agencyId, actorId: a.userId, actorRole: a.role, kind: "mail_disconnected" }));
    return NextResponse.json(await getOverview(a.agencyId, a.canManage, a.isAdmin), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("DELETE /api/dashboard/mail/connect failed:", (err as Error)?.message);
    return fail("No se pudo desconectar. Probá de nuevo.", 503);
  }
}
