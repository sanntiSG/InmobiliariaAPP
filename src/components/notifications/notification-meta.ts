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

export type NotificationGroup = "recomendaciones" | "actividad" | "gestion" | "sistema";

export const NOTIFICATION_GROUP_LABELS: Record<NotificationGroup, string> = {
  recomendaciones: "Recomendaciones",
  actividad: "Actividad",
  gestion: "Gestión",
  sistema: "Sistema",
};

/** Ícono, etiqueta y grupo de cada tipo de notificación (campana y página /notificaciones). */
export const NOTIFICATION_META: Record<string, { icon: LucideIcon; label: string; group: NotificationGroup }> = {
  new_match: { icon: Home, label: "Nueva propiedad para vos", group: "recomendaciones" },
  recommendation: { icon: Sparkles, label: "Recomendación", group: "recomendaciones" },
  price_drop: { icon: TrendingDown, label: "Bajó de precio", group: "recomendaciones" },
  availability: { icon: CalendarCheck, label: "Ya está disponible", group: "recomendaciones" },
  follow_new_property: { icon: Building2, label: "Inmobiliaria que seguís", group: "recomendaciones" },
  comment_reply: { icon: MessageCircle, label: "Respuesta", group: "actividad" },
  activity: { icon: MessageCircle, label: "Actividad", group: "actividad" },
  social_post: { icon: ImagePlus, label: "Contenido para redes", group: "gestion" },
  mail_draft: { icon: Mail, label: "Respuesta para confirmar", group: "gestion" },
  mail_error: { icon: TriangleAlert, label: "Correo: requiere atención", group: "gestion" },
  mail_attention: { icon: MailWarning, label: "Un cliente espera a una persona", group: "gestion" },
  lead: { icon: Users, label: "Nueva consulta", group: "gestion" },
  opportunity: { icon: Lightbulb, label: "Oportunidad", group: "gestion" },
  agency_request: { icon: UserPlus, label: "Solicitud pendiente", group: "gestion" },
  admin_alert: { icon: TriangleAlert, label: "Requiere atención", group: "gestion" },
  agency_approved: { icon: PartyPopper, label: "Solicitud aprobada", group: "sistema" },
  agency_rejected: { icon: CircleX, label: "Solicitud no aprobada", group: "sistema" },
  system: { icon: Bell, label: "Aviso", group: "sistema" },
};

export function notificationMeta(type: string) {
  return NOTIFICATION_META[type] ?? NOTIFICATION_META.system!;
}
