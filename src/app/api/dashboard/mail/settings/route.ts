import { NextResponse, after, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity/log";
import { mailAccess } from "@/lib/mail/access";
import { loadSettings, saveSettings, settingsPatchSchema } from "@/lib/mail/settings";
import { limitOr429 } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const a = await mailAccess(req);
  if (a instanceof NextResponse) return a;
  try {
    return NextResponse.json(await loadSettings(a.agencyId), { headers: NO_STORE });
  } catch (err) {
    console.error("GET /api/dashboard/mail/settings failed:", (err as Error)?.message);
    return NextResponse.json({ error: "No se pudo cargar la configuración." }, { status: 503 });
  }
}

/** Cambia cómo responde el agente. Sólo el dueño o el admin; sólo se pisan los campos que llegan. */
export async function PATCH(req: NextRequest) {
  const a = await mailAccess(req, { manage: true });
  if (a instanceof NextResponse) return a;
  const limited = await limitOr429(req, "mail-settings", 60, 60 * 60, { userId: a.userId });
  if (limited) return limited;

  const parsed = settingsPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Hay datos que no son válidos. Revisá la configuración." }, { status: 400, headers: NO_STORE });
  try {
    const saved = await saveSettings(a.agencyId, parsed.data);
    const changed = Object.keys(parsed.data);
    after(() =>
      logActivity({
        agencyId: a.agencyId,
        actorId: a.userId,
        actorRole: a.role,
        kind: "mail_settings_changed",
        changes: changed.map((field) => ({ field: `mail.${field}`, after: field === "mode" ? parsed.data.mode : undefined })),
      })
    );
    return NextResponse.json(saved, { headers: NO_STORE });
  } catch (err) {
    console.error("PATCH /api/dashboard/mail/settings failed:", (err as Error)?.message);
    return NextResponse.json({ error: "No se pudo guardar." }, { status: 503, headers: NO_STORE });
  }
}
