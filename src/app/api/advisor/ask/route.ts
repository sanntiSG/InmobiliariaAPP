import { NextRequest, NextResponse, after } from "next/server";
import { resolveAdvisorAccess } from "@/lib/advisor/access";
import { answer, willConsumeQuota } from "@/lib/advisor/engine";
import { getPersona } from "@/lib/advisor/persona";
import { ANON_LIMIT, consumeAnonQuota, peekAnonQuota } from "@/lib/advisor/quota";
import { askBodySchema } from "@/lib/advisor/schema";
import type { AdvisorAnswer, AdvisorContext, AdvisorQuota } from "@/lib/advisor/types";
import { logUnmatched } from "@/lib/advisor/unmatched";
import { clientIp, limitOr429 } from "@/lib/security/rate-limit";
import { readOrMintRid, setRidCookie } from "@/lib/tracking/visitor";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function quotaExhausted(quota: AdvisorQuota, context: AdvisorContext): AdvisorAnswer {
  return {
    intent: "quota",
    confidence: 1,
    mood: "neutral",
    lead: `Usaste tus ${ANON_LIMIT} preguntas gratis. Creá tu cuenta (es gratis) o iniciá sesión y sigo sin límites; además voy aprendiendo de lo que guardás para recomendarte mejor.`,
    blocks: [],
    followUps: [],
    actions: [
      { label: "Crear cuenta", href: "/crear-cuenta", kind: "primary" },
      { label: "Iniciar sesión", href: "/ingresar", kind: "secondary" },
    ],
    context,
    quota,
  };
}

/**
 * Pregunta al asesor. El modo, el alcance y los permisos se resuelven ACÁ, con la
 * sesión: nada de lo que mande el cliente (ids, contexto, inmobiliaria) amplía lo que
 * puede ver. Sin sesión sólo existe el modo explorador, con cupo de preguntas gratis.
 */
export async function POST(req: NextRequest) {
  const parsed = askBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Consulta inválida." }, { status: 400, headers: NO_STORE });
  const { mode, agencyId, input, context } = parsed.data;

  const resolved = await resolveAdvisorAccess(mode, agencyId);
  if (!resolved.ok) return resolved.response;
  const access = resolved.access;

  const limited = await limitOr429(req, "advisor-ask", access.userId ? 60 : 20, 60, { userId: access.userId ?? undefined });
  if (limited) return limited;

  const anonymous = mode === "explorer" && !access.userId;
  const { rid, minted } = readOrMintRid(req);
  const finish = (res: NextResponse) => (anonymous && minted ? setRidCookie(res, rid) : res);

  try {
    let quota: AdvisorQuota | undefined;
    if (anonymous) {
      if (await willConsumeQuota({ mode, input, context })) {
        const q = await consumeAnonQuota(rid, clientIp(req));
        if (!q.allowed) {
          return finish(NextResponse.json(quotaExhausted(q.quota, context ?? { turn: 0 }), { headers: NO_STORE }));
        }
        quota = q.quota;
      } else {
        quota = await peekAnonQuota(rid);
      }
    }

    const result = await answer({
      mode,
      agencyId: access.agencyId,
      isAdmin: access.isAdmin,
      userId: access.userId,
      input,
      context,
      persona: await getPersona(),
    });

    // Lo que no se entendió (anónimo, enmascarado) ayuda al admin a mejorar el motor.
    if ("text" in input && (result.intent === "unknown" || result.intent === "clarify")) {
      const kind = result.intent;
      after(() => logUnmatched(input.text, mode, kind));
    }

    return finish(NextResponse.json({ ...result, quota } satisfies AdvisorAnswer, { headers: NO_STORE }));
  } catch (err) {
    console.error("POST /api/advisor/ask failed:", err);
    return NextResponse.json({ error: "No pude responder ahora. Probá de nuevo en un momento." }, { status: 503, headers: NO_STORE });
  }
}
