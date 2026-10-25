import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { AdvisorUnmatched } from "@/lib/db/models/AdvisorUnmatched";
import { Mailbox } from "@/lib/db/models/Mailbox";
import { secretBox } from "@/lib/security/secret-box";
import { getAdminConfigState } from "@/lib/advisor/config";
import { AGENTS, isAgentId } from "@/lib/agents/registry";
import { requireFreshAdmin } from "@/lib/auth/require-fresh-admin";
import { AdvisorStudio } from "@/components/admin/advisor/AdvisorStudio";
import type { UnmatchedRow } from "@/app/api/admin/advisor/unmatched/route";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ agentId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { agentId } = await params;
  return { title: isAgentId(agentId) ? AGENTS[agentId].roleLabel : "Agente" };
}

const INTRO: Record<string, string> = {
  advisor: "Ponele nombre, elegí su modelo 3D y cuándo usa cada animación. Trabajás sobre un borrador: lo probás y recién cuando publicás lo ve la gente.",
  marketing: "Lo usan el admin y las personas de una inmobiliaria desde el botón flotante y desde Contenido para redes. Nace apagado: activalo y publicalo cuando quieras.",
  mail: "Lo usan el admin y las personas de una inmobiliaria para atender las consultas que llegan por mail. Nace apagado: activalo y publicalo cuando quieras.",
};

export default async function AgentStudioPage({ params }: Props) {
  const { agentId } = await params;
  if (!isAgentId(agentId)) notFound();
  const admin = await requireFreshAdmin();
  if (!admin) redirect("/ingresar");

  await connectDB();
  const [state, rows] = await Promise.all([
    getAdminConfigState(agentId),
    // Sólo el asesor conversa: el resto no tiene "preguntas que no entendió".
    agentId === "advisor" ? AdvisorUnmatched.find({}).sort({ count: -1, lastAt: -1 }).limit(100).lean() : Promise.resolve([]),
  ]);
  const unmatched: UnmatchedRow[] = rows.map((r) => ({
    id: String(r._id),
    text: r.text,
    mode: r.mode,
    kind: r.kind,
    count: r.count ?? 1,
    lastAt: new Date(r.lastAt).toISOString(),
  }));

  // Del agente de correo, el admin ve cómo está el servicio y cuántos buzones hay (el contenido de los mails nunca).
  const mailInfo =
    agentId === "mail"
      ? await Promise.all([Mailbox.countDocuments({}), Mailbox.countDocuments({ status: { $in: ["auth_failed", "error"] } }), Agency.countDocuments({})]).then(([connected, troubled, agencies]) => ({
          connected,
          troubled,
          agencies,
        }))
      : null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/admin/agentes" className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-text">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Agentes
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-text">{AGENTS[agentId].roleLabel}</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">{INTRO[agentId]}</p>
      </header>
      {mailInfo && (
        <section className="flex flex-col gap-3 rounded-card bg-surface p-5 shadow-card" aria-labelledby="mail-service">
          <h2 id="mail-service" className="font-display text-lg font-semibold text-text">
            Estado del servicio de correo
          </h2>
          <ul className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
            <li className="flex justify-between gap-3">
              <span className="text-text-muted">Clave de cifrado (MAIL_CREDENTIALS_KEY)</span>
              <strong className={secretBox.ready() ? "text-success" : "text-danger"}>{secretBox.ready() ? "Configurada" : "Falta"}</strong>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-text-muted">Revisión programada (MAIL_POLLER_ENABLED)</span>
              <strong className="text-text">{process.env.MAIL_POLLER_ENABLED === "true" ? "Activa en este servidor" : "No corre en este servidor"}</strong>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-text-muted">Envío de mails (MAIL_SEND_ENABLED)</span>
              <strong className="text-text">{process.env.MAIL_SEND_ENABLED === "true" ? "Activo en este servidor" : "No envía desde este servidor"}</strong>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-text-muted">Buzones conectados</span>
              <strong className="text-text">
                {mailInfo.connected} de {mailInfo.agencies} inmobiliarias
              </strong>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-text-muted">Con problemas</span>
              <strong className={mailInfo.troubled > 0 ? "text-warning" : "text-text"}>{mailInfo.troubled}</strong>
            </li>
          </ul>
          <p className="text-xs text-text-muted">
            Las variables se cargan en el panel de Netlify (y de Render, si querés revisar el correo desde ahí). Los pasos están en SETUP.md, sección “Agente de correo”.
          </p>
          <Link href="/dashboard/agentes/correo" className="group inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-accent">
            Ver el estado de cada buzón
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </section>
      )}
      <AdvisorStudio key={agentId} initial={state} unmatched={unmatched} agentId={agentId} />
    </div>
  );
}
