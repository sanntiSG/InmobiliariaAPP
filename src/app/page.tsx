import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { UserMenu } from "@/components/auth/UserMenu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { HeroCtas, type SecondaryCta } from "@/components/home/HeroCtas";
import { HeroStage } from "@/components/home/HeroStage";
import { HeroCardStack } from "@/components/home/HeroCardStack";
import { HeroMarquee } from "@/components/home/HeroMarquee";
import { HomeSections } from "@/components/home/HomeSections";
import { brand } from "@/config/brand";
import { getHeroStats } from "@/lib/home/hero-stats";
import { auth } from "@/auth";
import { getFreshAccount, type FreshAccount } from "@/lib/auth/fresh-account";

/**
 * Landing con los 3 caminos del brief: Explorar (sin cuenta), Ingresar /
 * Crear cuenta (auth real, ver src/auth.ts), y Publicá tu inmobiliaria — el
 * segundo CTA cambia según quién mira (ver resolveSecondaryCta más abajo).
 */
export default async function Home() {
  const statsPromise = getHeroStats();
  const session = await auth().catch(() => null);
  // Rol y agencia de la base, no del JWT: justo después de recibir el permiso o de crear la
  // inmobiliaria la cookie todavía trae el estado anterior.
  const [account, stats] = await Promise.all([
    session?.user?.id ? getFreshAccount(session.user.id) : null,
    statsPromise,
  ]);
  const secondaryCta = resolveSecondaryCta(account);

  return (
    <main>
      <section className="hero-main">
      <header className="hero-header">
        <Logo href={null} />
        <div className="flex items-center gap-2 sm:gap-3">
          <NotificationBell />
          <UserMenu compact />
          <ThemeToggle />
        </div>
      </header>

      <div className="hero-body">
        <HeroCardStack />
        <HeroStage
          eyebrow="Más que un portal inmobiliario"
          lines={[{ text: "Conocé la propiedad", strong: true }, { text: "antes de visitarla." }]}
          subtitle="Recorrelas en 360°, explorá el mapa y guardá tus favoritas. Sin moverte de tu casa."
          stats={stats}
        >
          <HeroCtas secondaryCta={secondaryCta} exploreMenu={account?.role === "user"} />
        </HeroStage>
      </div>

      <HeroMarquee />
      </section>

      <HomeSections secondaryCta={secondaryCta} />

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
    label: "Soy inmobiliaria",
    href: account ? "/solicitar-inmobiliaria" : "/crear-cuenta?tipo=gestionar",
  };
}
