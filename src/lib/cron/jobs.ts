/**
 * Las tareas que antes sólo corrían cuando alguien entraba a la web (alertas del admin, oportunidades de cada inmobiliaria): ahora
 * también las hace la pasada programada, así un aviso importante no espera a que alguien abra el panel. Cada tarea se limita con
 * `claimSlot` (compartido entre servidores) y todas respetan el plazo que les da la pasada. Los avisos que generan tienen
 * `dedupeKey`, así que si la tarea de siempre (la de "al entrar") también corre, nadie recibe un aviso repetido.
 * Las recomendaciones de cada persona NO se pasan acá: son por usuario y caras; siguen generándose cuando la persona entra.
 */
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { Property } from "@/lib/db/models/Property";
import { runAdminAlerts, runOpportunityNotifications } from "@/lib/intelligence/notify";
import { claimSlot, lastRuns } from "./slots";

export const JOBS = {
  adminAlertsEveryMs: 30 * 60_000,
  /** Cada inmobiliaria se revisa como mucho cada tanto, y sólo unas pocas por pasada: el costo no crece con la cantidad. */
  opportunitiesEveryMs: 6 * 3_600_000,
  opportunitiesPerRun: 2,
} as const;

export type JobsResult = { adminAlerts: boolean; opportunities: number };

export async function runScheduledJobs(deadline: number, now: Date = new Date()): Promise<JobsResult> {
  const result: JobsResult = { adminAlerts: false, opportunities: 0 };
  await connectDB();

  if (Date.now() < deadline && (await claimSlot("admin-alerts", JOBS.adminAlertsEveryMs, now))) {
    await runAdminAlerts();
    result.adminAlerts = true;
  }

  if (Date.now() >= deadline) return result;
  // Sólo inmobiliarias activas con algo publicado; se empieza por la que hace más que no se revisa (o nunca).
  const withListings = await Property.distinct("agencyId", { status: "published" });
  if (withListings.length === 0) return result;
  const agencies = await Agency.find({ _id: { $in: withListings }, status: "active" }).select("_id").limit(200).lean();
  const ids = agencies.map((a) => String(a._id));
  const seen = await lastRuns(ids.map((id) => `opp:${id}`));
  const due = ids
    .filter((id) => now.getTime() - (seen.get(`opp:${id}`) ?? 0) >= JOBS.opportunitiesEveryMs)
    .sort((a, b) => (seen.get(`opp:${a}`) ?? 0) - (seen.get(`opp:${b}`) ?? 0));

  for (const id of due) {
    if (Date.now() >= deadline || result.opportunities >= JOBS.opportunitiesPerRun) break;
    if (!(await claimSlot(`opp:${id}`, JOBS.opportunitiesEveryMs, now))) continue;
    await runOpportunityNotifications(id);
    result.opportunities++;
  }
  return result;
}
