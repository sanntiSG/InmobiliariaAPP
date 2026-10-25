/**
 * Señal de vida de la revisión programada del correo. La escribe la ruta del cron cada vez que la llaman con una clave
 * válida y la leen los paneles: el del admin ("corrió hace 3 minutos") y, en la web de respaldo, el aviso que manda a la
 * principal. Nunca guarda contenido de mails ni direcciones de casillas.
 */
import { connectDB } from "@/lib/db/connect";
import { ServiceHeartbeat } from "@/lib/db/models/ServiceHeartbeat";
import { publicSiteUrl } from "./site";

const KEY = "mail-poll";

export type RunStats = { polled: number; drafts: number; sent: number; errors: number };

export type MailHeartbeat = { lastRunAt: string | null; lastOkAt: string | null; siteUrl: string | null; stats: RunStats };

/** Anota una corrida. Nunca lanza: un fallo acá no debe romper la revisión. */
export async function recordMailRun(ok: boolean, stats: RunStats): Promise<void> {
  try {
    await connectDB();
    const now = new Date();
    // Sólo se guarda una dirección https (la que otra web puede usar para mandar a la gente acá).
    const found = publicSiteUrl();
    const siteUrl = found?.startsWith("https://") ? found : null;
    await ServiceHeartbeat.updateOne(
      { key: KEY },
      { $set: { lastRunAt: now, ...(ok ? { lastOkAt: now } : {}), ...(siteUrl ? { siteUrl } : {}), stats } },
      { upsert: true }
    );
  } catch (err) {
    console.error("recordMailRun failed:", (err as Error)?.message);
  }
}

export async function getMailHeartbeat(): Promise<MailHeartbeat | null> {
  await connectDB();
  const doc = await ServiceHeartbeat.findOne({ key: KEY }).lean();
  if (!doc) return null;
  const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
  return {
    lastRunAt: iso(doc.lastRunAt),
    lastOkAt: iso(doc.lastOkAt),
    siteUrl: doc.siteUrl ?? null,
    stats: { polled: doc.stats?.polled ?? 0, drafts: doc.stats?.drafts ?? 0, sent: doc.stats?.sent ?? 0, errors: doc.stats?.errors ?? 0 },
  };
}

/** Dirección de la web principal (la que corre la revisión), si ya se sabe. Sirve para mandar a la gente desde el respaldo. */
export async function mainSiteUrl(): Promise<string | null> {
  try {
    return (await getMailHeartbeat())?.siteUrl ?? null;
  } catch {
    return null;
  }
}
