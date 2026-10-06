import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db/connect";
import { User } from "@/lib/db/models/User";
import { registerSchema } from "@/lib/validation/auth";
import { createNotification } from "@/lib/notifications/create";
import { brand } from "@/config/brand";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  const { name, email, password } = parsed.data;

  // Freno a la creación masiva de cuentas desde una misma IP.
  const limit = await rateLimit(`register:${clientIp(req)}`, 10, 60 * 60);
  if (!limit.ok) {
    return NextResponse.json({ error: "Demasiados registros desde tu red. Probá más tarde." }, { status: 429 });
  }

  try {
    await connectDB();

    const existing = await User.findOne({ email: email.toLowerCase() }).select("_id").lean();
    if (existing) {
      return NextResponse.json({ error: "Ya existe una cuenta con ese email." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: email.toLowerCase(), passwordHash, role: "user" });

    await createNotification({
      userId: String(user._id),
      type: "system",
      title: `¡Bienvenido a ${brand.name}!`,
      body: "Contanos tus preferencias en tu perfil para empezar a recibir recomendaciones personalizadas.",
      href: "/perfil",
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("POST /api/auth/register failed:", err);
    return NextResponse.json(
      { error: "No se pudo crear la cuenta. Intentá de nuevo en un momento." },
      { status: 503 }
    );
  }
}
