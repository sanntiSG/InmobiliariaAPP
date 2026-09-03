import { auth } from "@/auth";

/** Sesión de un usuario admin (el proveedor de la plataforma), o null. */
export async function requireAdminUser() {
  const session = await auth().catch(() => null);
  const user = session?.user;
  if (!user?.id || user.role !== "admin") return null;
  return user;
}
