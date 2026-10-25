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

/** Para el admin sin una inmobiliaria elegida: TODAS las inmobiliarias y el estado de su casilla (nunca el contenido de los mails). */
async function AdminMailboxes() {
  await connectDB();
  const agencies = await Agency.find({ status: { $ne: "suspended" } }).select("name").sort({ name: 1 }).limit(200).lean();
  const ids = agencies.map((a) => a._id);
  const [mailboxes, settings, waiting] = await Promise.all([
    Mailbox.find({ agencyId: { $in: ids } }).select("agencyId provider email status lastPollAt").lean(),
    MailSettings.find({ agencyId: { $in: ids } }).select("agencyId mode").lean(),
    MailMessage.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { agencyId: { $in: ids }, status: "awaiting_confirmation" } }, { $group: { _id: "$agencyId", n: { $sum: 1 } } }]),
  ]);
  const box = new Map(mailboxes.map((m) => [String(m.agencyId), m]));
  const mode = new Map(settings.map((s) => [String(s.agencyId), s.mode]));
  const pending = new Map(waiting.map((w) => [String(w._id), w.n]));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-text">Correo de las inmobiliarias</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          {mailboxes.length} de {agencies.length} {agencies.length === 1 ? "inmobiliaria conectó" : "inmobiliarias conectaron"} su casilla. Cada una conecta <strong className="font-semibold text-text">una</strong>: la que recibe las consultas de sus clientes. Tu correo de admin no se vincula a nada.
        </p>
      </header>

      <ol className="grid max-w-3xl gap-3 text-sm text-text-muted sm:grid-cols-3">
        {[
          ["Se conecta", "Cada inmobiliaria conecta su casilla de consultas desde su panel (o la conectás vos por ella, entrando “viendo como”)."],
          ["Se revisa", "Cada 5 minutos leo lo que llegó de nuevo, descarto lo que no es una consulta y dejo la respuesta lista con sus propiedades."],
          ["Se confirma", "Una persona la revisa y sale desde esa misma casilla. En modo automático sale sola sólo si es clara."],
        ].map(([title, text], i) => (
          <li key={title} className="flex gap-3 rounded-card bg-surface p-4 shadow-card">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft font-mono text-xs font-semibold text-accent" aria-hidden>
              {i + 1}
            </span>
            <span>
              <strong className="block font-semibold text-text">{title}</strong>
              {text}
            </span>
          </li>
        ))}
      </ol>

      {agencies.length === 0 ? (
        <p className="rounded-card bg-surface p-6 text-sm text-text-muted shadow-card">Todavía no hay inmobiliarias. Creá una desde Admin → Inmobiliarias.</p>
      ) : (
        <div className="overflow-hidden rounded-card bg-surface shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="px-4 py-3 font-medium sm:px-5">Inmobiliaria</th>
                  <th className="hidden px-5 py-3 font-medium md:table-cell">Casilla</th>
                  <th className="px-4 py-3 font-medium sm:px-5">Estado</th>
                  <th className="hidden px-5 py-3 font-medium md:table-cell">Modo</th>
                  <th className="hidden px-5 py-3 text-right font-medium sm:table-cell">Para confirmar</th>
                  <th className="hidden px-5 py-3 font-medium lg:table-cell">Última revisión</th>
                  <th className="px-4 py-3 sm:px-5" />
                </tr>
              </thead>
              <tbody>
                {agencies.map((a) => {
                  const id = String(a._id);
                  const m = box.get(id);
                  const st = m ? STATUS_TEXT[m.status ?? "active"] : { label: "Sin conectar", tone: "bg-surface-2 text-text-muted" };
                  return (
                    <tr key={id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-text sm:px-5">
                        {a.name}
                        {m && <span className="mt-0.5 block text-xs font-normal text-text-muted md:hidden">{mask(m.email)}</span>}
                      </td>
                      <td className="hidden px-5 py-3 text-text-muted md:table-cell">{m ? mask(m.email) : "—"}</td>
                      <td className="px-4 py-3 sm:px-5">
                        <span className={cn("whitespace-nowrap rounded-pill px-2.5 py-1 text-xs font-medium", st.tone)}>{st.label}</span>
                      </td>
                      <td className="hidden px-5 py-3 text-text-muted md:table-cell">{m ? (mode.get(id) === "auto" ? "Automático" : "Con confirmación") : "—"}</td>
                      <td className="hidden px-5 py-3 text-right text-text sm:table-cell">{m ? (pending.get(id) ?? 0) : "—"}</td>
                      <td className="hidden px-5 py-3 text-text-muted lg:table-cell">{m?.lastPollAt ? formatRelativeTime(m.lastPollAt) : "—"}</td>
                      <td className="px-4 py-1 text-right sm:px-5">
                        <Link href={`/dashboard/agentes/correo?agencyId=${id}`} className="inline-flex min-h-11 items-center whitespace-nowrap font-semibold text-accent hover:underline">
                          {m ? "Ver como" : "Conectar casilla"}
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
