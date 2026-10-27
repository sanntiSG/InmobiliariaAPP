import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { groupsForRole } from "@/config/notifications";
import { getPushStatus } from "@/lib/push/status";
import { NotificationSettings } from "@/components/notifications/NotificationSettings";
import { PushActivation } from "@/components/admin/PushActivation";

export const metadata: Metadata = { title: "Admin — Avisos" };
export const dynamic = "force-dynamic";

/** Los avisos del admin (los suyos) y la activación de los avisos del dispositivo para toda la plataforma. */
export default async function AdminNotificationsPage() {
  const session = await auth().catch(() => null);
  if (!session?.user?.id) redirect("/ingresar?callbackUrl=%2Fadmin%2Fnotificaciones");
  const status = await getPushStatus();
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-text">Avisos</h1>
        <p className="mt-1 text-sm text-text-muted">Activá una vez los avisos del dispositivo para toda la plataforma y elegí cuáles recibís vos.</p>
      </header>
      <PushActivation status={status} />
      <NotificationSettings groups={groupsForRole(session.user.role)} />
    </div>
  );
}
