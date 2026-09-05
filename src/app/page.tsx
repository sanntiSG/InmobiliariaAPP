import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { UserMenu } from "@/components/auth/UserMenu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { HeroCtas, type SecondaryCta } from "@/components/home/HeroCtas";
import { brand } from "@/config/brand";
import { buildWhatsappLink } from "@/config/site";
import { auth } from "@/auth";

/**
 * Landing con los 3 caminos del brief: Explorar (sin cuenta), Ingresar /
 * Crear cuenta (auth real, ver src/auth.ts), y Publicá tu inmobiliaria — el
 * segundo CTA cambia según quién mira (ver resolveSecondaryCta más abajo).
 */
export default async function Home() {
  const session = await auth().catch(() => null);
  const secondaryCta = resolveSecondaryCta(session?.user);

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, var(--accent-soft) 0%, transparent 70%)",
        }}
        aria-hidden
      />

      <header className="relative flex items-center justify-between px-5 py-5 sm:px-8">
        <Logo href={null} />
        <div className="flex items-center gap-2 sm:gap-3">
          <NotificationBell />
          <UserMenu compact />
          <ThemeToggle />
        </div>
      </header>

      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <h1 className="max-w-3xl text-balance font-display text-[clamp(2.25rem,6vw,4rem)] font-bold leading-[1.05] text-text">
          {brand.tagline}
        </h1>
        <p className="mt-5 max-w-xl text-balance text-lg text-text-muted">{brand.description}</p>

        <HeroCtas secondaryCta={secondaryCta} />
        <p className="mt-4 max-w-md text-balance text-sm text-text-muted">
          Explorar no necesita cuenta. Creá una para guardar propiedades, comentar y recibir
          recomendaciones.
        </p>
      </div>

      <footer className="relative px-6 pb-8 text-center text-xs text-text-muted">
        {brand.name} — {brand.domainLabel}
      </footer>
    </main>
  );
}

/**
 * El segundo CTA de la landing depende de quién mira:
 * - admin → directo a su panel.
 * - inmobiliaria ya con agencia → a su dashboard.
 * - habilitada pero sin agencia todavía → a /publicar (crear la suya).
 * - cualquier otro caso (sin sesión, o usuario sin permiso de agencia) →
 *   comportamiento original: WhatsApp al proveedor.
 */
function resolveSecondaryCta(
  user: { role?: string; agencyId?: string | null } | undefined
): SecondaryCta {
  if (user?.role === "admin") {
    return { label: "Panel de admin", href: "/admin" };
  }
  if (user?.role === "agency_owner" || user?.role === "agency_agent") {
    return user.agencyId
      ? { label: "Ir a mi panel", href: "/dashboard" }
      : { label: "Creá tu inmobiliaria", href: "/publicar" };
  }
  return {
    label: "Publicá tu inmobiliaria",
    href: buildWhatsappLink(`Hola! Quiero publicar mi inmobiliaria en ${brand.name}.`),
    external: true,
  };
}
