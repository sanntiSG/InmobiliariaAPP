import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { getAdminConfigState } from "@/lib/advisor/config";
import { AGENTS, AGENT_IDS } from "@/lib/agents/registry";
import { requireFreshAdmin } from "@/lib/auth/require-fresh-admin";
import { AGENT_ICONS } from "@/components/agents/agent-icons";
import { MascotFallback } from "@/components/advisor/mascot/MascotFallback";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Agentes" };
export const dynamic = "force-dynamic";

const chip = "inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-medium";

export default async function AgentsPage() {
  const admin = await requireFreshAdmin();
  if (!admin) redirect("/ingresar");

  const states = await Promise.all(AGENT_IDS.map((id) => getAdminConfigState(id)));
  // Sin imagen propia, los agentes nuevos muestran la del asesor (comparten modelo).
  const advisorPoster = states[0]?.published.poster ?? null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-text">Agentes</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          Cada agente tiene su propio nombre, modelo 3D y animaciones, y todos comparten lo que saben de la plataforma. Los cambios quedan en un borrador: los probás y
          recién cuando publicás los ve la gente.
        </p>
      </header>

      <ul className="rise-group flex flex-col divide-y divide-border rounded-card bg-surface shadow-card">
        {AGENT_IDS.map((id, i) => {
          const def = AGENTS[id];
          const s = states[i]!;
          const Icon = AGENT_ICONS[id];
          const published = id === "advisor" || s.publishedAt != null;
          const audiences = [s.published.enabled.agency && "inmobiliarias y admin", s.published.enabled.explorer && "exploradores"].filter(Boolean) as string[];
          const live = published && audiences.length > 0;
          return (
            <li key={id}>
              <Link href={`/admin/agentes/${id}`} className="group flex flex-wrap items-center gap-x-5 gap-y-3 p-5 transition-colors hover:bg-surface-2/60 sm:p-6">
                <span className="relative size-16 shrink-0 rounded-full bg-surface-2 shadow-pop" aria-hidden>
                  <span className="absolute inset-0 overflow-hidden rounded-full">
                    <MascotFallback poster={s.published.poster ?? advisorPoster} calm />
                  </span>
                  <span className="absolute -bottom-0.5 -right-0.5 grid size-6 place-items-center rounded-full bg-accent text-accent-contrast ring-2 ring-surface">
                    <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </span>
                </span>

                <span className="min-w-0 flex-1 basis-56">
                  <span className="flex flex-wrap items-baseline gap-x-2.5">
                    <span className="font-display text-lg font-semibold text-text">{s.published.name || def.roleLabel}</span>
                    {s.published.name && <span className="text-sm text-text-muted">{def.roleLabel}</span>}
                  </span>
                  <span className="mt-0.5 block text-sm text-text-muted">{def.tagline}</span>
                  <span className="mt-2.5 flex flex-wrap gap-1.5">
                    <span className={cn(chip, live ? "bg-success-soft text-success" : "bg-surface-2 text-text-muted")}>
                      {live ? `Activo para ${audiences.join(" y ")}` : published ? "Apagado" : "Sin publicar"}
                    </span>
                    {s.hasUnpublished && <span className={cn(chip, "bg-accent-soft text-accent")}>Cambios sin publicar</span>}
                  </span>
                </span>

                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
                  Configurar
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
