import type { DefaultSession } from "next-auth";
import type { USER_ROLES } from "@/lib/db/models/User";

type Role = (typeof USER_ROLES)[number];

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      agencyId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role?: Role;
    agencyId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    agencyId: string | null;
    /** Epoch ms de la última vez que se releyó el rol desde la DB — ver src/auth.ts. */
    roleCheckedAt?: number;
  }
}

// `next-auth/jwt` reexporta el tipo `JWT` de `@auth/core/jwt` (`export *`), y
// el aumento de módulo de arriba no siempre se fusiona a través de ese
// re-export — se declara también contra el módulo de origen para que
// `token.role` etc. no caigan en el índice `Record<string, unknown>`.
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
    agencyId: string | null;
    roleCheckedAt?: number;
  }
}
