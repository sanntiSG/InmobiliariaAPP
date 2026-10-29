import type { Types } from "mongoose";
import { Agency } from "@/lib/db/models/Agency";
import { User } from "@/lib/db/models/User";

/** Ids de las personas que gestionan una inmobiliaria (dueños + agentes con esa agencia). Sirve para permisos; los avisos usan `agencyRecipients`. */
export async function agencyMemberIds(agencyId: string | Types.ObjectId): Promise<string[]> {
  const [agency, members] = await Promise.all([
    Agency.findById(agencyId).select("owners").lean(),
    User.find({ agencyId }).select("_id").lean(),
  ]);
  return [...new Set([...(agency?.owners ?? []).map(String), ...members.map((m) => String(m._id))])];
}

export type AgencyRecipients = {
  ids: string[];
  /** `true` si la inmobiliaria no tiene dueño ni agentes y sus avisos van a los admins. */
  viaAdmins: boolean;
  agencyName: string;
};

/**
 * Quiénes se enteran de lo que pasa en una inmobiliaria: sus dueños y agentes. Si todavía no tiene ninguno (la administra el admin
 * "viendo como" ella), y está activa, los avisos van a los admins de la plataforma: si no, no le llegarían a nadie. Cuando se le
 * asigna un dueño, pasan a él solos.
 */
export async function agencyRecipients(agencyId: string | Types.ObjectId): Promise<AgencyRecipients> {
  const [agency, members] = await Promise.all([
    Agency.findById(agencyId).select("owners name status").lean(),
    User.find({ agencyId }).select("_id").lean(),
  ]);
  const ids = [...new Set([...(agency?.owners ?? []).map(String), ...members.map((m) => String(m._id))])];
  const agencyName = agency?.name ?? "";
  if (ids.length > 0 || agency?.status !== "active") return { ids, viaAdmins: false, agencyName };
  const admins = await User.find({ role: "admin" }).select("_id").lean();
  return { ids: admins.map((a) => String(a._id)), viaAdmins: true, agencyName };
}
