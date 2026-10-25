import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { connectDB } from "@/lib/db/connect";
import { AgencyRequest } from "@/lib/db/models/AgencyRequest";
import { AllowedEmail } from "@/lib/db/models/AllowedEmail";
import { Agency } from "@/lib/db/models/Agency";
import { AgencyRequestsManager, type AgencyRequestRow } from "@/components/admin/AgencyRequestsManager";
import { AllowedEmailsManager } from "@/components/admin/AllowedEmailsManager";
import { PanelTabs } from "@/components/panel/PanelTabs";

export const metadata = { title: "Admin — Altas y permisos" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ vista?: string | string[] }> };

async function Requests() {
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
    <>
      <p className="max-w-2xl text-sm text-text-muted">
        Personas que pidieron gestionar una inmobiliaria. Hablá con ellas por WhatsApp o llamada y, cuando las valides, aprobá la solicitud: van a recibir una
        felicitación y podrán crear su inmobiliaria.
      </p>
      <AgencyRequestsManager requests={rows} />
    </>
  );
}

async function Access() {
  const [allowedEmails, agencies] = await Promise.all([
    AllowedEmail.find({}).sort({ createdAt: -1 }).populate("agencyId", "name slug").lean(),
    Agency.find({}).select("name").sort({ name: 1 }).lean(),
  ]);
  return (
    <>
      <p className="max-w-2xl text-sm text-text-muted">
        Autorizá un email de Google para que gestione una inmobiliaria. Podés vincularlo a una ya creada, o dejarlo sin inmobiliaria para que la persona cree la suya.
      </p>
      <AllowedEmailsManager
        initialEmails={allowedEmails.map((entry) => {
          const agency = entry.agencyId as unknown as { _id: string; name: string; slug: string } | null;
          return {
            _id: String(entry._id),
            email: entry.email,
            status: entry.status as "pending" | "awaiting_agency" | "active",
            agencyId: agency ? { _id: String(agency._id), name: agency.name, slug: agency.slug } : null,
            createdAt: (entry.createdAt as Date).toISOString(),
          };
        })}
        agencies={agencies.map((a) => ({ _id: String(a._id), name: a.name }))}
      />
    </>
  );
}

export default async function AdminAccessAndRequestsPage({ searchParams }: Props) {
  const admin = await requireAdminUser();
  if (!admin) redirect("/ingresar");

  const raw = (await searchParams).vista;
  const vista = (Array.isArray(raw) ? raw[0] : raw) === "accesos" ? "accesos" : "solicitudes";

  await connectDB();
  const pending = await AgencyRequest.countDocuments({ status: "pending" }).catch(() => 0);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-text">Altas y permisos</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          Quién puede gestionar una inmobiliaria: los pedidos que llegan (solicitudes) y los emails que ya autorizaste (accesos).
        </p>
      </header>
      <PanelTabs
        ariaLabel="Altas y permisos"
        active={vista}
        tabs={[
          { id: "solicitudes", label: "Solicitudes", href: "/admin/altas?vista=solicitudes", count: pending },
          { id: "accesos", label: "Accesos", href: "/admin/altas?vista=accesos" },
        ]}
      />
      {vista === "solicitudes" ? <Requests /> : <Access />}
    </div>
  );
}
