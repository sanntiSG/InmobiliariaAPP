import { auth } from "@/auth";

/** Sesión de un usuario con inmobiliaria (agency_owner/agency_agent), o null. */
export async function requireAgencyUser() {
  const session = await auth().catch(() => null);
  const user = session?.user;
  if (!user?.id || !user.agencyId) return null;
  if (user.role !== "agency_owner" && user.role !== "agency_agent") return null;
  return { ...user, agencyId: user.agencyId as string };
}
