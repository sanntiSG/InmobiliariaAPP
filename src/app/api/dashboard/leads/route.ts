import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect";
import { Lead } from "@/lib/db/models/Lead";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { agencyScope, scopeFilter } from "@/lib/auth/agency-scope";
import { toLeadRow } from "@/lib/leads/serialize";

/** Leads de la inmobiliaria del usuario (el admin ve todos, o filtra con ?agencyId). */
export async function GET(req: NextRequest) {
  const access = await requireDashboardAccess();
  if (!access) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const scope = agencyScope(access, req.nextUrl.searchParams.get("agencyId"));
  if (!scope) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  try {
    await connectDB();
    const docs = await Lead.find(scopeFilter(scope))
      .sort({ updatedAt: -1 })
      .limit(300)
      .populate({ path: "propertyId", select: "title slug" })
      .lean();
    return NextResponse.json({ items: docs.map(toLeadRow) });
  } catch (err) {
    console.error("GET /api/dashboard/leads failed:", err);
    return NextResponse.json({ error: "No se pudieron cargar los clientes." }, { status: 503 });
  }
}
