import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Types } from "mongoose";
import { ArrowLeft, Mail } from "lucide-react";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { Mailbox } from "@/lib/db/models/Mailbox";
import { MailMessage } from "@/lib/db/models/MailMessage";
import { MailSettings } from "@/lib/db/models/MailSettings";
import { getPublishedAgents } from "@/lib/advisor/config";
import { agencyScope } from "@/lib/auth/agency-scope";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { MAILBOX_STATUSES } from "@/lib/mail/constants";
import { MailCenter } from "@/components/mail/MailCenter";
import { formatRelativeTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Correo" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** "a***@gmail.com": el admin ve que hay una casilla y de qué proveedor, no la dirección entera. */
const mask = (email: string) => {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
};

const STATUS_TEXT: Record<(typeof MAILBOX_STATUSES)[number], { label: string; tone: string }> = {
  active: { label: "Conectada", tone: "bg-success-soft text-success" },
  auth_failed: { label: "Contraseña rechazada", tone: "bg-danger-soft text-danger" },
  error: { label: "Con problemas", tone: "bg-warning-soft text-warning" },
  paused: { label: "Pausada", tone: "bg-surface-2 text-text-muted" },
};

/** Para el admin sin una inmobiliaria elegida: el ESTADO de todos los buzones (nunca el contenido de los mails). */
async function AdminMailboxes() {
  await connectDB();
  const [mailboxes, totalAgencies] = await Promise.all([Mailbox.find({}).select("agencyId provider email status lastPollAt").sort({ lastPollAt: -1 }).limit(200).lean(), Agency.countDocuments({})]);
  const ids = mailboxes.map((m) => m.agencyId);
  const [agencies, settings, waiting] = await Promise.all([
    Agency.find({ _id: { $in: ids } }).select("name").lean(),
    MailSettings.find({ agencyId: { $in: ids } }).select("agencyId mode").lean(),
    MailMessage.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { agencyId: { $in: ids }, status: "awaiting_confirmation" } }, { $group: { _id: "$agencyId", n: { $sum: 1 } } }]),
  ]);
  const name = new Map(agencies.map((a) => [String(a._id), a.name]));
  const mode = new Map(settings.map((s) => [String(s.agencyId), s.mode]));
  const pending = new Map(waiting.map((w) => [String(w._id), w.n]));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-text">Correo de las inmobiliarias</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          {mailboxes.length} de {totalAgencies} {totalAgencies === 1 ? "inmobiliaria conectó" : "inmobiliarias conectaron"} su casilla. Ves el estado de cada una; para abrir sus mails tenés que entrar “viendo como” esa inmobiliaria, y queda anotado en su bitácora.
        </p>
      </header>
      {mailboxes.length === 0 ? (
        <p className="rounded-card bg-surface p-6 text-sm text-text-muted shadow-card">Todavía ninguna inmobiliaria conectó su casilla.</p>
      ) : (
        <div className="overflow-hidden rounded-card bg-surface shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="px-5 py-3 font-medium">Inmobiliaria</th>
                  <th className="px-5 py-3 font-medium">Casilla</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium">Modo</th>
                  <th className="px-5 py-3 text-right font-medium">Para confirmar</th>
                  <th className="px-5 py-3 font-medium">Última revisión</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {mailboxes.map((m) => {
                  const id = String(m.agencyId);
                  const st = STATUS_TEXT[m.status ?? "active"];
                  return (
                    <tr key={String(m._id)} className="border-b border-border last:border-0">
                      <td className="px-5 py-3 font-medium text-text">{name.get(id) ?? "—"}</td>
                      <td className="px-5 py-3 text-text-muted">{mask(m.email)}</td>
                      <td className="px-5 py-3">
                        <span className={cn("rounded-pill px-2.5 py-1 text-xs font-medium", st.tone)}>{st.label}</span>
                      </td>
                      <td className="px-5 py-3 text-text-muted">{mode.get(id) === "auto" ? "Automático" : "Con confirmación"}</td>
                      <td className="px-5 py-3 text-right text-text">{pending.get(id) ?? 0}</td>
                      <td className="px-5 py-3 text-text-muted">{m.lastPollAt ? formatRelativeTime(m.lastPollAt) : "—"}</td>
                      <td className="px-5 py-3 text-right">
                        <Link href={`/dashboard/agentes/correo?agencyId=${id}`} className="font-semibold text-accent hover:underline">
                          Ver como
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default async function MailAgentPage({ searchParams }: Props) {
  const access = await requireDashboardAccess();
  if (!access) redirect("/ingresar");
  if (access.needsOnboarding) redirect("/publicar");

  const params = await searchParams;
  const scope = agencyScope(access, first(params.agencyId));
  if (!scope) redirect("/dashboard");

  const published = await getPublishedAgents();
  if (!access.isAdmin && !published.mail.enabled.agency) {
    return (
      <div className="flex max-w-xl flex-col gap-3 rounded-card bg-surface p-6 shadow-card">
        <Mail className="h-6 w-6 text-text-muted" aria-hidden />
        <h1 className="font-display text-lg font-semibold text-text">El agente de correo todavía no está disponible</h1>
        <p className="text-sm text-text-muted">Cuando se active para tu inmobiliaria lo vas a encontrar acá y en el botón redondo de agentes.</p>
      </div>
    );
  }
  if (access.isAdmin && !scope.agencyId) return <AdminMailboxes />;

  const m = first(params.m);
  const openId = m && Types.ObjectId.isValid(m) ? m : null;
  const agent = published.mail;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href={access.isAdmin ? "/dashboard/agentes/correo" : "/dashboard/agentes"} className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-text">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {access.isAdmin ? "Todos los buzones" : "Agentes"}
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-text">Correo{agent.name ? ` · ${agent.name}` : ""}</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          Leo las consultas que llegan a tu casilla, entiendo qué preguntan y te dejo la respuesta lista con tus propiedades. Vos confirmás cada una (o me dejás responder solo lo que es claro).
        </p>
      </header>
      <MailCenter key={scope.agencyId ?? "own"} agencyId={access.isAdmin ? scope.agencyId : null} openId={openId} />
    </div>
  );
}
