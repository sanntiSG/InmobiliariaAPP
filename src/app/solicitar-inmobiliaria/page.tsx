import { redirect } from "next/navigation";
import { Clock, MessageCircle, PartyPopper, XCircle } from "lucide-react";
import { auth } from "@/auth";
import { getFreshAccount, isAgencyRole } from "@/lib/auth/fresh-account";
import { connectDB } from "@/lib/db/connect";
import { AgencyRequest } from "@/lib/db/models/AgencyRequest";
import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { UserMenu } from "@/components/auth/UserMenu";
import { buttonClasses } from "@/components/ui/Button";
import { AgencyRequestForm } from "@/components/agency/AgencyRequestForm";
import { providerQuickMessage, providerRequestMessage, whatsappUrl } from "@/lib/whatsapp/messages";
import { ContinueAfterApproval } from "@/components/agency/ContinueAfterApproval";
import { brand } from "@/config/brand";
import { formatRelativeTime } from "@/lib/utils/format";

export const metadata = { title: "Gestionar una inmobiliaria" };

export default async function SolicitarInmobiliariaPage() {
  const session = await auth().catch(() => null);
  const user = session?.user;

  if (!user?.id) redirect("/ingresar?callbackUrl=%2Fsolicitar-inmobiliaria");
  // Rol y agencia de la base (no del JWT, que puede estar desactualizado).
  const account = await getFreshAccount(user.id);
  if (!account) redirect("/ingresar");
  if (account.role === "admin") redirect("/admin");
  if (isAgencyRole(account.role)) {
    redirect(account.agencyId ? "/dashboard" : "/publicar");
  }

  await connectDB();
  const latest = await AgencyRequest.findOne({ userId: user.id }).sort({ createdAt: -1 }).lean();

  const userName = user.name ?? "";
  const userEmail = user.email ?? "";

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6">
          <Logo href="/" />
          <div className="flex items-center gap-2 sm:gap-3">
            <UserMenu compact />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10 sm:px-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-text">Gestionar una inmobiliaria</h1>
          <p className="mt-1.5 text-sm text-text-muted">
            En {brand.name} cada inmobiliaria tiene su propio panel para publicar propiedades, subir recorridos
            360° y ver cómo le va. Para activarlo, el equipo valida la solicitud hablando con vos.
          </p>
        </div>

        {latest?.status !== "approved" && (
          <a
            href={whatsappUrl(providerQuickMessage())}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses("secondary", "md", "inline-flex w-fit items-center gap-2")}
          >
            <MessageCircle className="h-4 w-4" aria-hidden /> Hablar por WhatsApp
          </a>
        )}

        {latest?.status === "pending" && (
          <StatusCard
            icon={<Clock className="h-6 w-6" aria-hidden />}
            title="Tu solicitud está en revisión"
            description={`Enviada ${formatRelativeTime(latest.createdAt.toISOString())} para "${latest.agencyName}". Te avisamos acá apenas la resolvamos. Si todavía no hablaron con vos, escribinos por WhatsApp.`}
          >
            <a
              href={whatsappUrl(
                providerRequestMessage({
                  userName,
                  email: userEmail,
                  agencyName: latest.agencyName,
                  zone: latest.zone,
                  phone: latest.phone,
                  message: latest.message,
                })
              )}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses("primary", "md")}
            >
              Enviar mis datos por WhatsApp
            </a>
          </StatusCard>
        )}

        {latest?.status === "approved" && (
          <StatusCard
            icon={<PartyPopper className="h-6 w-6" aria-hidden />}
            title="¡Tu solicitud fue aprobada!"
            description="Ya podés crear el perfil de tu inmobiliaria y empezar a publicar."
          >
            <ContinueAfterApproval />
          </StatusCard>
        )}

        {latest?.status === "rejected" && (
          <>
            <StatusCard
              icon={<XCircle className="h-6 w-6" aria-hidden />}
              title="Tu última solicitud no fue aprobada"
              description={latest.reviewNote || "Podés escribirnos por WhatsApp para conversarlo o enviar una nueva solicitud."}
            />
            <AgencyRequestForm userName={userName} email={userEmail} resubmit />
          </>
        )}

        {!latest && <AgencyRequestForm userName={userName} email={userEmail} />}
      </div>
    </div>
  );
}

function StatusCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-card bg-surface p-6 shadow-card">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">{icon}</span>
      <div>
        <h2 className="font-display text-xl font-bold text-text">{title}</h2>
        <p className="mt-1.5 text-sm text-text-muted">{description}</p>
      </div>
      {children}
    </div>
  );
}
