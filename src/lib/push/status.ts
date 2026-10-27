/**
 * Cómo está el sistema de avisos del dispositivo, para el panel del admin: si ESTE despliegue puede enviar (tiene las claves VAPID),
 * cuántas personas y dispositivos hay y cuántos avisos esperan salir. Sólo números: nunca claves ni direcciones de dispositivos.
 */
import { connectDB } from "@/lib/db/connect";
import { Notification } from "@/lib/db/models/Notification";
import { PushSubscription } from "@/lib/db/models/PushSubscription";
import { vapidConfig } from "./vapid";

export type PushStatusView = { canSendHere: boolean; devices: number; people: number; pending: number; failedLastDay: number };

export async function getPushStatus(): Promise<PushStatusView> {
  await connectDB();
  const since = new Date(Date.now() - 86_400_000);
  const [devices, people, pending, failedLastDay] = await Promise.all([
    PushSubscription.countDocuments({ disabledAt: null }),
    PushSubscription.distinct("userId", { disabledAt: null }).then((a) => a.length),
    Notification.countDocuments({ "push.state": "pending" }),
    Notification.countDocuments({ "push.state": "failed", "push.at": { $gte: since } }),
  ]);
  return { canSendHere: !!vapidConfig(), devices, people, pending, failedLastDay };
}
