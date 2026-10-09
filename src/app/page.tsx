import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { UserMenu } from "@/components/auth/UserMenu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { HeroCtas, type SecondaryCta } from "@/components/home/HeroCtas";
import { HeroScene } from "@/components/home/HeroScene";
import { HeroTypingText } from "@/components/home/HeroTypingText";
import { HeroFeatures } from "@/components/home/HeroFeatures";
import { brand } from "@/config/brand";
import { auth } from "@/auth";
import { getFreshAccount, type FreshAccount } from "@/lib/auth/fresh-account";

/**
 * Landing con los 3 caminos del brief: Explorar (sin cuenta), Ingresar /
 * Crear cuenta (auth real, ver src/auth.ts), y Publicá tu inmobiliaria — el
 * segundo CTA cambia según quién mira (ver resolveSecondaryCta más abajo).
 */
export default async function Home() {
  const session = await auth().catch(() => null);
  // Rol y agencia de la base, no del JWT: justo después de recibir el permiso o de crear la
  // inmobiliaria la cookie todavía trae el estado anterior.
  const account = session?.user?.id ? await getFreshAccount(session.user.id) : null;
  const secondaryCta = resolveSecondaryCta(account);

  return (
    <main className="hero-main">
      {/* Background 3D scene */}
      <HeroScene />

      {/* Header — mismo estilo que antes, sobre la escena 3D */}
      <header className="hero-header">
        <Logo href={null} />
        <div className="flex items-center gap-2 sm:gap-3">
          <NotificationBell />
          <UserMenu compact />
          <ThemeToggle />
        </div>
      </header>

      {/* Hero content — left-aligned, lower portion */}
      <div className="hero-content">
        <HeroTypingText
          line1={brand.tagline}
          line2Bold="nueva generación"
          line2Suffix=" de propiedades."
          subtitle="Más que un portal inmobiliario"
        />

        <HeroCtas secondaryCta={secondaryCta} exploreMenu={account?.role === "user"} />
      </div>

      {/* Scroll-down indicator (flecha ↓ como en la referencia) */}
      <div className="hero-scroll-indicator" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M10 3v14m0 0l-5-5m5 5l5-5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Features bar al fondo */}
      <HeroFeatures />

      <footer className="hero-footer">
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
 *   solicitud para gestionar una inmobiliaria (ver /solicitar-inmobiliaria).
 */
function resolveSecondaryCta(account: FreshAccount | null): SecondaryCta {
  if (account?.role === "admin") {
    return { label: "Panel de admin", href: "/admin" };
  }
  if (account?.role === "agency_owner" || account?.role === "agency_agent") {
    return account.agencyId
      ? { label: "Ir a mi panel", href: "/dashboard" }
      : { label: "Creá tu inmobiliaria", href: "/publicar" };
  }
  // Sin cuenta: se elige "Gestionar una inmobiliaria" al registrarse. Con cuenta
  // de explorador: directo a la solicitud. En ambos casos el formulario termina
  // ofreciendo el contacto por WhatsApp con el proveedor.
  return {
    label: "Publicá tu inmobiliaria",
    href: account ? "/solicitar-inmobiliaria" : "/crear-cuenta?tipo=gestionar",
  };
}
