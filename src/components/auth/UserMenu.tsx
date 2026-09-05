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
  const isAgency = session.user.role === "agency_owner" || session.user.role === "agency_agent";
  const isAdmin = session.user.role === "admin";
  const needsOnboarding = isAgency && !session.user.agencyId;

  return (
    <div className="flex items-center gap-2">
      {isAgency && (
        <Link
          href={needsOnboarding ? "/publicar" : "/dashboard"}
          className="hidden text-sm font-medium text-accent hover:underline sm:inline"
        >
          {needsOnboarding ? "Creá tu inmobiliaria" : "Panel"}
        </Link>
      )}
      {isAdmin && (
        <Link href="/admin" className="hidden text-sm font-medium text-accent hover:underline sm:inline">
          Admin
        </Link>
      )}
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
