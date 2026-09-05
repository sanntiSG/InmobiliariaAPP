import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db/connect";
import { User } from "@/lib/db/models/User";
import { loginSchema } from "@/lib/validation/auth";
import { resolveAccessForEmail } from "@/lib/auth/resolve-access";
import { authConfig } from "@/auth.config";

/** Cada cuánto (ms) se relee el rol desde la DB en un JWT ya emitido. */
const ROLE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    Google,
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        await connectDB();
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: String(user._id),
          name: user.name,
          email: user.email,
          image: user.image ?? undefined,
          role: user.role,
          agencyId: user.agencyId ? String(user.agencyId) : null,
        };
      },
    }),
  ],
  callbacks: {
    // `authorized` (usado por el middleware) viene de authConfig — acá se
    // sobreescriben signIn/jwt/session con las versiones completas (con
    // acceso a Mongo), que no pueden vivir en la config edge-safe.
    ...authConfig.callbacks,
    /**
     * signIn — se ejecuta para cada intento de login (Google o credentials).
     * Para Google: crea o actualiza el usuario en MongoDB y asigna rol vía
     * `resolveAccessForEmail` (única fuente de verdad — ver ese módulo), sin
     * degradar nunca a un usuario que ya tiene un rol de agencia legítimo.
     */
    signIn: async ({ user, account, profile }) => {
      if (account?.provider !== "google") return true;

      await connectDB();
      const email = (profile?.email ?? user.email ?? "").toLowerCase();
      if (!email) return false;

      const access = await resolveAccessForEmail(email);

      // Upsert: crear si no existe, actualizar datos de Google si ya existe.
      // `role`/`agencyId` siempre se fijan explícitamente (nunca quedan
      // huérfanos de un estado anterior) con el valor ya resuelto.
      const dbUser = await User.findOneAndUpdate(
        { email },
        {
          $set: {
            name: profile?.name ?? user.name ?? email.split("@")[0],
            image: (profile as Record<string, unknown>)?.picture as string ?? user.image ?? undefined,
            provider: "google",
            emailVerified: new Date(),
            role: access.role,
            agencyId: access.agencyId,
            ...(profile?.sub ? { googleId: profile.sub } : {}),
          },
          $setOnInsert: {
            passwordHash: null,
          },
        },
        { upsert: true, new: true }
      );

      // Inyectar datos en el objeto user para que el callback jwt los reciba
      user.id = String(dbUser._id);
      user.role = dbUser.role;
      user.agencyId = dbUser.agencyId ? String(dbUser.agencyId) : null;

      // Si es agency_owner/agent con inmobiliaria, asegurar que está en owners[] de la Agency
      if ((access.role === "agency_owner" || access.role === "agency_agent") && access.agencyId) {
        const { Agency } = await import("@/lib/db/models/Agency");
        await Agency.updateOne(
          { _id: access.agencyId },
          { $addToSet: { owners: dbUser._id } }
        );
      }

      // Reflejar el login en AllowedEmail: pasa a "active" (con agencia) o
      // "awaiting_agency" (permiso concedido, falta crear la inmobiliaria).
      if (access.role === "agency_owner" || access.role === "agency_agent") {
        const { AllowedEmail } = await import("@/lib/db/models/AllowedEmail");
        await AllowedEmail.updateOne(
          { email },
          { $set: { status: access.needsOnboarding ? "awaiting_agency" : "active" } }
        );
      }

      return true;
    },

    jwt: async ({ token, user, trigger }) => {
      if (user) {
        token.id = user.id!;
        token.role = user.role ?? "user";
        token.agencyId = user.agencyId ?? null;
        token.picture = user.image ?? null;
        token.roleCheckedAt = Date.now();
        return token;
      }

      // Refresco periódico (cada ROLE_REFRESH_INTERVAL_MS) o manual (trigger
      // "update", vía useSession().update()): releer desde la DB para que
      // conceder o revocar un permiso tenga efecto sin cerrar sesión.
      const isStale = Date.now() - (token.roleCheckedAt ?? 0) > ROLE_REFRESH_INTERVAL_MS;

      if (trigger === "update" || isStale) {
        await connectDB();
        const dbUser = await User.findById(token.id).lean();
        if (dbUser) {
          token.role = dbUser.role ?? "user";
          token.agencyId = dbUser.agencyId ? String(dbUser.agencyId) : null;
          token.picture = dbUser.image ?? null;
          token.name = dbUser.name;
        }
        token.roleCheckedAt = Date.now();
      }

      return token;
    },

    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role;
        session.user.agencyId = token.agencyId as string | null;
        session.user.image = (token.picture as string) ?? null;
      }
      return session;
    },
  },
});
