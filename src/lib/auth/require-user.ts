import { auth } from "@/auth";

/** Devuelve la sesión actual, o null si no hay usuario logueado. */
export async function requireUser() {
  const session = await auth().catch(() => null);
  if (!session?.user?.id) return null;
  return session.user;
}
