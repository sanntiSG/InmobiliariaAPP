"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

/** Sesión actual: enlaces de ingreso/registro, o saludo + cerrar sesión. */
export function UserMenu({ compact = false }: { compact?: boolean }) {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <Skeleton className="h-9 w-24 rounded-pill" />;
  }

  if (!session?.user) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/ingresar" className={buttonClasses("ghost", "sm")}>
          Ingresar
        </Link>
        {!compact && (
          <Link href="/crear-cuenta" className={buttonClasses("primary", "sm")}>
            Crear cuenta
          </Link>
        )}
      </div>
    );
  }

  const firstName = session.user.name?.split(" ")[0] ?? "Vos";

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/perfil"
        className="text-sm font-medium text-text-muted hover:text-text hidden sm:inline"
      >
        {compact ? "Mi perfil" : `Hola, ${firstName}`}
      </Link>
      <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: "/" })}>
        Cerrar sesión
      </Button>
    </div>
  );
}
