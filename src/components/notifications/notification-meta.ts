import {
  Bell,
  Building2,
  CalendarCheck,
  CircleX,
  Home,
  ImagePlus,
  Lightbulb,
  Mail,
  MailWarning,
  MessageCircle,
  PartyPopper,
  Sparkles,
  TriangleAlert,
  TrendingDown,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { NOTIFICATION_GROUP_LABELS, groupOf, type NotificationGroup } from "@/config/notifications";

export { NOTIFICATION_GROUP_LABELS, type NotificationGroup };

/** Ícono, etiqueta y grupo de cada tipo de notificación (campana y página /notificaciones). */
export const NOTIFICATION_META: Record<string, { icon: LucideIcon; label: string; group: NotificationGroup }> = {
  new_match: { icon: Home, label: "Nueva propiedad para vos", group: groupOf("new_match") },
  recommendation: { icon: Sparkles, label: "Recomendación", group: groupOf("recommendation") },
  price_drop: { icon: TrendingDown, label: "Bajó de precio", group: groupOf("price_drop") },
  availability: { icon: CalendarCheck, label: "Ya está disponible", group: groupOf("availability") },
  follow_new_property: { icon: Building2, label: "Inmobiliaria que seguís", group: groupOf("follow_new_property") },
  comment_reply: { icon: MessageCircle, label: "Respuesta", group: groupOf("comment_reply") },
  activity: { icon: MessageCircle, label: "Actividad", group: groupOf("activity") },
  social_post: { icon: ImagePlus, label: "Contenido para redes", group: groupOf("social_post") },
  mail_draft: { icon: Mail, label: "Respuesta para confirmar", group: groupOf("mail_draft") },
  mail_error: { icon: TriangleAlert, label: "Correo: requiere atención", group: groupOf("mail_error") },
  mail_attention: { icon: MailWarning, label: "Un cliente espera a una persona", group: groupOf("mail_attention") },
  lead: { icon: Users, label: "Nueva consulta", group: groupOf("lead") },
  opportunity: { icon: Lightbulb, label: "Oportunidad", group: groupOf("opportunity") },
  agency_request: { icon: UserPlus, label: "Solicitud pendiente", group: groupOf("agency_request") },
  admin_alert: { icon: TriangleAlert, label: "Requiere atención", group: groupOf("admin_alert") },
  agency_approved: { icon: PartyPopper, label: "Solicitud aprobada", group: groupOf("agency_approved") },
  agency_rejected: { icon: CircleX, label: "Solicitud no aprobada", group: groupOf("agency_rejected") },
  system: { icon: Bell, label: "Aviso", group: groupOf("system") },
};

export function notificationMeta(type: string) {
  return NOTIFICATION_META[type] ?? NOTIFICATION_META.system!;
}
