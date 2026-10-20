import type { NextRequest, NextResponse } from "next/server";

/**
 * Cookie de visitante anónimo: no identifica a nadie, sólo permite contar
 * visitantes únicos (tracking) y el cupo de preguntas gratis del asesor.
 * `httpOnly`, `sameSite=lax`, un año.
 */
export const VISITOR_COOKIE = "rid";
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El `rid` de la cookie si es válido; si no, uno nuevo (`minted: true` → hay que setear la cookie). */
export function readOrMintRid(req: NextRequest): { rid: string; minted: boolean } {
  const existing = req.cookies.get(VISITOR_COOKIE)?.value;
  if (existing && UUID_RE.test(existing)) return { rid: existing, minted: false };
  return { rid: crypto.randomUUID(), minted: true };
}

export function setRidCookie<T extends NextResponse>(res: T, rid: string): T {
  res.cookies.set(VISITOR_COOKIE, rid, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VISITOR_COOKIE_MAX_AGE,
  });
  return res;
}
