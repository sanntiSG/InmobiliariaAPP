/**
 * Defensa en profundidad: bloquea /admin, /dashboard y /publicar antes de
 * que la página llegue a renderizar, usando el callback `authorized` de
 * `src/auth.config.ts`. La verificación autoritativa sigue siendo el guard
 * de cada página (requireAdminUser, requireDashboardAccess, etc.) — esto
 * sólo evita que el contenido de una página protegida se renderice de más.
 *
 * "Proxy" es el nombre nuevo de lo que antes era `middleware.ts` (Next 16) —
 * a diferencia del middleware clásico, corre en runtime Node.js, así que
 * puede reusar directamente el `auth` completo (con Mongo) sin necesitar
 * una config aparte "edge-safe".
 */
export { auth as proxy } from "@/auth";

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/publicar"],
};
