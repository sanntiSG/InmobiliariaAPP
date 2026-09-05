import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { connectDB } from "@/lib/db/connect";
import { AllowedEmail } from "@/lib/db/models/AllowedEmail";
import { Agency } from "@/lib/db/models/Agency";
import { AllowedEmailsManager } from "@/components/admin/AllowedEmailsManager";

export const metadata = { title: "Admin — Accesos" };

export default async function AdminAccessPage() {
  const admin = await requireAdminUser();
  if (!admin) redirect("/ingresar");

  await connectDB();

  const [allowedEmails, agencies] = await Promise.all([
    AllowedEmail.find({}).sort({ createdAt: -1 }).populate("agencyId", "name slug").lean(),
    Agency.find({}).select("name").sort({ name: 1 }).lean(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-text">Accesos</h1>
        <p className="text-sm text-text-muted">
          Autorizá un email de Google para que gestione una inmobiliaria. Podés vincularlo a una ya
          creada, o dejarlo sin inmobiliaria para que la persona cree la suya.
        </p>
      </div>

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
    </div>
  );
}
