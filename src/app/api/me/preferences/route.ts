import { NextResponse } from "next/server";
import { preferencesSchema } from "@/lib/validation/preferences";
import { requireUser } from "@/lib/auth/require-user";
import { connectDB } from "@/lib/db/connect";
import { User } from "@/lib/db/models/User";

export async function PATCH(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = preferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    await connectDB();
    const p = parsed.data;
    const $set: Record<string, unknown> = {
      "preferences.operations": p.operations,
      "preferences.propertyTypes": p.propertyTypes,
      "preferences.locations": p.locations,
    };
    const $unset: Record<string, 1> = {};
    for (const key of ["priceMin", "priceMax", "priceCurrency", "minRooms"] as const) {
      if (p[key] != null) $set[`preferences.${key}`] = p[key];
      else $unset[`preferences.${key}`] = 1;
    }
    await User.updateOne({ _id: user.id }, { $set, ...(Object.keys($unset).length ? { $unset } : {}) });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/me/preferences failed:", err);
    return NextResponse.json({ error: "No se pudieron guardar tus preferencias." }, { status: 503 });
  }
}
