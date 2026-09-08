import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

/**
 * Defensa en profundidad: bloquea /admin, /dashboard y /publicar antes de
 * que la página llegue a renderizar, usando el callback `authorized` de
 * `src/auth.config.ts`.
 *
 * Importante para Netlify/Vercel (Edge runtime): inicializa NextAuth sólo con
 * `authConfig` (edge-safe, sin providers ni mongoose) para que no arrastre
 * dependencias de Node.js al handler del middleware.
 */
const { auth } = NextAuth(authConfig);

export const proxy = auth;
export default auth;

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/publicar"],
};


