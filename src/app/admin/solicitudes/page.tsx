import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { connectDB } from "@/lib/db/connect";
import { AgencyRequest } from "@/lib/db/models/AgencyRequest";
import { AgencyRequestsManager, type AgencyRequestRow } from "@/components/admin/AgencyRequestsManager";

export const metadata = { title: "Admin — Solicitudes" };

export default async function AdminRequestsPage() {
  const admin = await requireAdminUser();
  if (!admin) redirect("/ingresar");

  await connectDB();
  // Pendientes primero (las más viejas arriba: son las que llevan más tiempo esperando), después el historial.
  const [pending, resolved] = await Promise.all([
    AgencyRequest.find({ status: "pending" }).sort({ createdAt: 1 }).lean(),
    AgencyRequest.find({ status: { $ne: "pending" } }).sort({ reviewedAt: -1 }).limit(30).lean(),
  ]);

  const rows: AgencyRequestRow[] = [...pending, ...resolved].map((r) => ({
    id: String(r._id),
    name: r.name,
    email: r.email,
    agencyName: r.agencyName,
    phone: r.phone,
    zone: r.zone,
    message: r.message ?? "",
    status: r.status as AgencyRequestRow["status"],
    reviewNote: r.reviewNote ?? "",
    createdAt: r.createdAt.toISOString(),
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-text">Solicitudes de inmobiliarias</h1>
        <p className="text-sm text-text-muted">
          Personas que pidieron gestionar una inmobiliaria. Hablá con ellas por WhatsApp o llamada y, cuando
          las valides, aprobá la solicitud: van a recibir una felicitación y podrán crear su inmobiliaria.
        </p>
      </div>
      <AgencyRequestsManager requests={rows} />
    </div>
  );
}
