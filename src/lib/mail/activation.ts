/**
 * Cómo está la activación del agente de correo, para el panel del admin: si la clave está cargada, si la revisión
 * programada corre, cuántas casillas hay. Sólo números y estados: nunca direcciones de casillas ni contenido de mails.
 */
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { Mailbox } from "@/lib/db/models/Mailbox";
import { getMailHeartbeat } from "./heartbeat";
import { mailRuntime } from "./runtime";

export type MailActivationStatus = {
  keyReady: boolean;
  platform: "main" | "backup";
  poller: boolean;
  sender: boolean;
  /** Minutos desde la última vez que corrió la revisión programada (null: todavía no corrió). */
  lastRunAgoMin: number | null;
  /** Qué hizo esa última corrida (sólo conteos): sirve para distinguir "corre pero no revisa nada" de "anda bien". */
  lastRun: { polled: number; drafts: number; sent: number; errors: number } | null;
  connected: number;
  troubled: number;
  agencies: number;
  /** El agente ya está publicado y encendido para alguien. */
  agentOn: boolean;
  mainSiteUrl: string | null;
};

export async function getActivationStatus(agentOn: boolean): Promise<MailActivationStatus> {
  await connectDB();
  const [connected, troubled, agencies, beat] = await Promise.all([
    Mailbox.countDocuments({}),
    Mailbox.countDocuments({ status: { $in: ["auth_failed", "error"] } }),
    Agency.countDocuments({}),
    getMailHeartbeat().catch(() => null),
  ]);
  const runtime = mailRuntime();
  return {
    keyReady: runtime.keyReady,
    platform: runtime.platform,
    poller: runtime.poller,
    sender: runtime.sender,
    lastRunAgoMin: beat?.lastRunAt ? Math.max(0, Math.floor((Date.now() - new Date(beat.lastRunAt).getTime()) / 60_000)) : null,
    lastRun: beat?.lastRunAt ? beat.stats : null,
    connected,
    troubled,
    agencies,
    agentOn,
    mainSiteUrl: beat?.siteUrl ?? null,
  };
}
