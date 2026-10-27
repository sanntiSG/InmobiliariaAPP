import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { groupsForRole } from "@/config/notifications";
import { NotificationSettings } from "@/components/notifications/NotificationSettings";

export const metadata: Metadata = { title: "Avisos" };
export const dynamic = "force-dynamic";

/** Los avisos de quien gestiona una inmobiliaria: dónde los recibe y cuáles quiere. Sólo con cuenta (el panel ya lo exige). */
export default async function DashboardNotificationsPage() {
  const session = await auth().catch(() => null);
  if (!session?.user?.id) redirect("/ingresar?callbackUrl=%2Fdashboard%2Fnotificaciones");
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-text">Avisos</h1>
        <p className="mt-1 text-sm text-text-muted">Elegí cuáles recibís (nuevas consultas, respuestas del agente de correo para confirmar, oportunidades) y dónde: en la campana, en tu celular o en tu computadora.</p>
      </header>
      <NotificationSettings groups={groupsForRole(session.user.role)} />
    </div>
  );
}
