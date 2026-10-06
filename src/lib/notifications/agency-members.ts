import type { Types } from "mongoose";
import { Agency } from "@/lib/db/models/Agency";
import { User } from "@/lib/db/models/User";

/** Ids de las personas que gestionan una inmobiliaria (dueños + agentes con esa agencia). */
export async function agencyMemberIds(agencyId: string | Types.ObjectId): Promise<string[]> {
  const [agency, members] = await Promise.all([
    Agency.findById(agencyId).select("owners").lean(),
    User.find({ agencyId }).select("_id").lean(),
  ]);
  return [...new Set([...(agency?.owners ?? []).map(String), ...members.map((m) => String(m._id))])];
}
