import { NextRequest, NextResponse } from "next/server";
import { resolveAdvisorAccess } from "@/lib/advisor/access";
import { agencyBriefing, explorerBriefing } from "@/lib/advisor/briefing";
import { getPersona } from "@/lib/advisor/persona";
import { peekAnonQuota } from "@/lib/advisor/quota";
import { briefingBodySchema } from "@/lib/advisor/schema";
import type { AdvisorBriefing } from "@/lib/advisor/types";
import { limitOr429 } from "@/lib/security/rate-limit";
import { readOrMintRid, setRidCookie } from "@/lib/tracking/visitor";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Lo que el asesor dice al abrirse: saludo, titulares y preguntas sugeridas. No consume el cupo
 * gratuito (es el asesor quien habla, no la persona quien pregunta).
 */
export async function POST(req: NextRequest) {
  const parsed = briefingBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Consulta inválida." }, { status: 400, headers: NO_STORE });
  const { mode, agencyId, focusPropertyId } = parsed.data;

  const resolved = await resolveAdvisorAccess(mode, agencyId);
  if (!resolved.ok) return resolved.response;
  const access = resolved.access;

  const limited = await limitOr429(req, "advisor-brief", access.userId ? 40 : 20, 60, { userId: access.userId ?? undefined });
  if (limited) return limited;

  const anonymous = mode === "explorer" && !access.userId;
  const { rid, minted } = readOrMintRid(req);

  try {
    const persona = await getPersona();
    const briefing: AdvisorBriefing =
      mode === "agency"
        ? await agencyBriefing(access.agencyId, persona)
        : await explorerBriefing({ userId: access.userId, focusPropertyId, persona });

    if (anonymous) briefing.quota = await peekAnonQuota(rid);

    const res = NextResponse.json({ ...briefing, persona }, { headers: NO_STORE });
    return anonymous && minted ? setRidCookie(res, rid) : res;
  } catch (err) {
    console.error("POST /api/advisor/briefing failed:", err);
    return NextResponse.json({ error: "No pude prepararme ahora. Probá de nuevo en un momento." }, { status: 503, headers: NO_STORE });
  }
}
