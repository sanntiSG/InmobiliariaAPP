import { NextResponse } from "next/server";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";

/** Inmobiliarias entre las que el admin puede elegir para preparar contenido (el agente de marketing se lo pregunta). Sólo admin. */
export async function GET() {
  const access = await requireDashboardAccess();
  if (!access?.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  try {
    await connectDB();
    const agencies = await Agency.find({ status: { $ne: "suspended" } }).select("name").sort({ name: 1 }).limit(200).lean();
    return NextResponse.json({ items: agencies.map((a) => ({ id: String(a._id), name: a.name })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("GET /api/dashboard/social/agencies failed:", err);
    return NextResponse.json({ error: "No se pudo cargar la lista." }, { status: 503 });
  }
}
