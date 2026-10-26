import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { connectDB } from "@/lib/db/connect";
import { AdvisorUnmatched } from "@/lib/db/models/AdvisorUnmatched";
import { getAdminConfigState } from "@/lib/advisor/config";
import { INTENT_LABELS } from "@/lib/advisor/compose/labels";
import { INTENT_BY_ID } from "@/lib/advisor/nlu/intents";
import { listLessons, type LessonRow } from "@/lib/agents/lessons";
import { AGENTS, isAgentId } from "@/lib/agents/registry";
import { requireFreshAdmin } from "@/lib/auth/require-fresh-admin";
import { getActivationStatus } from "@/lib/mail/activation";
import { MailActivation } from "@/components/admin/agents/MailActivation";
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
  const [state, rows, lessons] = await Promise.all([
    getAdminConfigState(agentId),
    // Sólo el asesor conversa: el resto no tiene "preguntas que no entendió".
    agentId === "advisor" ? AdvisorUnmatched.find({}).sort({ count: -1, lastAt: -1 }).limit(100).lean() : Promise.resolve([]),
    // El asesor y el correo aprenden de lo que el admin les enseña; marketing guía pasos y no interpreta texto.
    agentId === "advisor" || agentId === "mail" ? listLessons(agentId) : Promise.resolve([] as LessonRow[]),
  ]);
  const intentOptions = agentId === "advisor" ? [...INTENT_BY_ID.values()].filter((d) => !d.id.startsWith("common.")).map((d) => ({ id: d.id, label: INTENT_LABELS[d.id], audience: d.audience })) : [];
  const intentLabels = Object.fromEntries(intentOptions.map((o) => [o.id, o.label]));
  const unmatched: UnmatchedRow[] = rows.map((r) => ({
    id: String(r._id),
    text: r.text,
    mode: r.mode,
    kind: r.kind,
    count: r.count ?? 1,
    lastAt: new Date(r.lastAt).toISOString(),
  }));

  // Del agente de correo, el admin ve cómo está el servicio y cuántos buzones hay (el contenido de los mails nunca).
  const mailStatus = agentId === "mail" ? await getActivationStatus(!!state.publishedAt && (state.published.enabled.agency || state.published.enabled.explorer)) : null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/admin/agentes" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-text">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Agentes
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-text">{AGENTS[agentId].roleLabel}</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">{INTRO[agentId]}</p>
      </header>
      {mailStatus && <MailActivation status={mailStatus} />}
      <AdvisorStudio key={agentId} initial={state} unmatched={unmatched} agentId={agentId} lessons={lessons} intentOptions={intentOptions} intentLabels={intentLabels} />
    </div>
  );
}
