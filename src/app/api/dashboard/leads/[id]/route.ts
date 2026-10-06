import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { Lead } from "@/lib/db/models/Lead";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { agencyScope, scopeFilter } from "@/lib/auth/agency-scope";
import { leadUpdateSchema } from "@/lib/validation/lead";
import { flagsForStatus } from "@/lib/leads/status";
import { toLeadRow } from "@/lib/leads/serialize";

/** Cambiar etapa, anotar o registrar un contacto sobre un lead PROPIO (otra inmobiliaria → 404). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireDashboardAccess();
  if (!access) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const scope = agencyScope(access);
  if (!scope) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const parsed = leadUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const changes = parsed.data;

  try {
    await connectDB();
    // El filtro por agencia va en la propia query: un lead ajeno es indistinguible de uno inexistente.
    const lead = await Lead.findOne({ _id: id, ...scopeFilter(scope) });
    if (!lead) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

    const now = new Date();
    let touchedContact = !!changes.contacted;

    if (changes.status && changes.status !== lead.status) {
      lead.status = changes.status;
      lead.history.push({ status: changes.status, at: now, by: access.userId as never });
      // Pasar de etapa implica haber estado en contacto, y las etapas avanzadas suponen las anteriores.
      const implied = flagsForStatus(changes.status);
      lead.visitRequested = lead.visitRequested || implied.visitRequested;
      lead.visitDone = lead.visitDone || implied.visitDone;
      lead.offerMade = lead.offerMade || implied.offerMade;
      touchedContact = true;
    }
    if (changes.visitRequested !== undefined) lead.visitRequested = changes.visitRequested;
    if (changes.visitDone !== undefined) lead.visitDone = changes.visitDone;
    if (changes.offerMade !== undefined) lead.offerMade = changes.offerMade;
    if (changes.note) {
      lead.notes.push({ text: changes.note, at: now, by: access.userId as never });
      touchedContact = true;
    }
    if (touchedContact) lead.lastContactAt = now;

    await lead.save();
    await lead.populate({ path: "propertyId", select: "title slug" });
    return NextResponse.json({ item: toLeadRow(lead.toObject()) });
  } catch (err) {
    console.error("PATCH /api/dashboard/leads/[id] failed:", err);
    return NextResponse.json({ error: "No se pudo actualizar el cliente." }, { status: 503 });
  }
}
