import { NextResponse } from "next/server";
import { NO_STORE, adminGuard, publishDraft } from "@/lib/advisor/admin";

export const dynamic = "force-dynamic";

/** Publica el borrador: desde ahora es lo que ve la gente. */
export async function POST(req: Request) {
  const guard = await adminGuard(req);
  if (guard instanceof NextResponse) return guard;
  try {
    return NextResponse.json(await publishDraft(guard.userId), { headers: NO_STORE });
  } catch (err) {
    console.error("POST /api/admin/advisor/publish failed:", err);
    return NextResponse.json({ error: "No se pudo publicar." }, { status: 503, headers: NO_STORE });
  }
}
