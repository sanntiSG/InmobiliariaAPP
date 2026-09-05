import type { NextAuthConfig } from "next-auth";

/**
 * Config base compartida por `src/auth.ts` (login real, con Mongo) y
 * `src/proxy.ts` (bloqueo de rutas en cada request). Acá vive sólo la parte
 * liviana: qué rutas requieren qué rol (`authorized`) y cómo se proyecta
 * el token a `session.user`, sin providers ni acceso a Mongo/bcrypt.
 *
 * `authorized` es **defensa en profundidad**: la verificación autoritativa
 * sigue siendo el guard de cada página/route handler (`requireAdminUser`,
 * `requireDashboardAccess`, etc.) — esto sólo evita que el contenido de una
 * página protegida llegue a renderizarse antes de esos checks.
 */
export const authConfig = {
  pages: { signIn: "/ingresar" },
  providers: [],
  callbacks: {
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.agencyId = token.agencyId;
      }
      return session;
    },
    authorized({ auth, request }) {
      const role = auth?.user?.role;
      const { pathname } = request.nextUrl;

      if (pathname.startsWith("/admin")) return role === "admin";
      if (pathname.startsWith("/dashboard") || pathname === "/publicar") {
        return role === "admin" || role === "agency_owner" || role === "agency_agent";
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
