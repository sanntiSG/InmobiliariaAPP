import {
  BadgeX,
  Bell,
  Bookmark,
  Building2,
  CalendarCheck,
  Camera,
  CircleX,
  Heart,
  Home,
  ImagePlus,
  Lightbulb,
  Mail,
  MailCheck,
  MailWarning,
  MessageCircle,
  MessageSquare,
  PartyPopper,
  Share2,
  Sparkles,
  Star,
  TriangleAlert,
  TrendingDown,
  TrendingUp,
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
  price_up: { icon: TrendingUp, label: "Subió de precio", group: groupOf("price_up") },
  unavailable: { icon: BadgeX, label: "Ya no está disponible", group: groupOf("unavailable") },
  new_media: { icon: Camera, label: "Novedades en una propiedad", group: groupOf("new_media") },
  comment_reply: { icon: MessageCircle, label: "Respuesta", group: groupOf("comment_reply") },
  activity: { icon: MessageCircle, label: "Actividad", group: groupOf("activity") },
  follower: { icon: UserPlus, label: "Nuevo seguidor", group: groupOf("follower") },
  like: { icon: Heart, label: "Me gusta", group: groupOf("like") },
  save: { icon: Bookmark, label: "Guardada", group: groupOf("save") },
  share: { icon: Share2, label: "Compartida", group: groupOf("share") },
  rating: { icon: Star, label: "Nuevo puntaje", group: groupOf("rating") },
  property_comment: { icon: MessageSquare, label: "Nuevo comentario", group: groupOf("property_comment") },
  social_post: { icon: ImagePlus, label: "Contenido para redes", group: groupOf("social_post") },
  mail_draft: { icon: Mail, label: "Respuesta para confirmar", group: groupOf("mail_draft") },
  mail_auto: { icon: MailCheck, label: "Respondido automáticamente", group: groupOf("mail_auto") },
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
