import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { getPublishedAgents } from "@/lib/advisor/config";
import { AGENTS, agentsForAudience } from "@/lib/agents/registry";
import { requireDashboardAccess } from "@/lib/auth/require-dashboard-access";
import { AGENT_ICONS } from "@/components/agents/agent-icons";
import { OpenAgentButton } from "@/components/agents/OpenAgentButton";
import { MascotFallback } from "@/components/advisor/mascot/MascotFallback";

export const metadata: Metadata = { title: "Agentes" };
export const dynamic = "force-dynamic";

/** Dónde se ajusta cada agente dentro del panel (si tiene un lugar propio). */
const SETTINGS: Partial<Record<string, { href: string; label: string }>> = {
  marketing: { href: "/dashboard/contenido", label: "Ver contenido para redes" },
};

export default async function DashboardAgentsPage() {
  const access = await requireDashboardAccess();
  if (!access) redirect("/ingresar");

  const published = await getPublishedAgents();
  // Los que el admin dejó activos para inmobiliarias, en el mismo orden que el botón flotante.
  const agents = agentsForAudience("agency").filter((id) => published[id].enabled.agency);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-text">Agentes</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          Ayudantes que trabajan con los datos de tu inmobiliaria. Los abrís desde acá o desde el botón redondo que te acompaña en toda la plataforma.
        </p>
      </header>

      {agents.length === 0 ? (
        <p className="rounded-card bg-surface p-6 text-sm text-text-muted shadow-card">Todavía no hay agentes activos para tu inmobiliaria.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-card bg-surface shadow-card">
          {agents.map((id) => {
            const def = AGENTS[id];
            const cfg = published[id];
            const Icon = AGENT_ICONS[id];
            const poster = cfg.poster ?? published.advisor.poster ?? null;
            const settings = SETTINGS[id];
            return (
              <li key={id} className="flex flex-wrap items-center gap-x-5 gap-y-3 p-5 sm:p-6">
                <span className="relative size-16 shrink-0 rounded-full bg-surface-2 shadow-pop" aria-hidden>
                  <span className="absolute inset-0 overflow-hidden rounded-full">
                    <MascotFallback poster={poster} calm />
                  </span>
                  <span className="absolute -bottom-0.5 -right-0.5 grid size-6 place-items-center rounded-full bg-accent text-accent-contrast ring-2 ring-surface">
                    <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </span>
                </span>

                <div className="min-w-0 flex-1 basis-56">
                  <p className="flex flex-wrap items-baseline gap-x-2.5">
                    <span className="font-display text-lg font-semibold text-text">{cfg.name || def.roleLabel}</span>
                    {cfg.name && <span className="text-sm text-text-muted">{def.roleLabel}</span>}
                  </p>
                  <p className="mt-0.5 text-sm text-text-muted">{cfg.description}</p>
                </div>

                <div className="flex items-center gap-4">
                  {settings && (
                    <Link href={settings.href} className="group inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
                      {settings.label}
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
                    </Link>
                  )}
                  <OpenAgentButton id={id} label={`Abrir ${cfg.name || def.roleLabel}`} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
