import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { buttonClasses } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { UserMenu } from "@/components/auth/UserMenu";
import { brand } from "@/config/brand";
import { buildWhatsappLink } from "@/config/site";

/**
 * Landing con los 3 caminos del brief: Explorar (sin cuenta), Ingresar /
 * Crear cuenta (auth real, ver src/auth.ts), y Publicá tu inmobiliaria
 * (contacto directo por WhatsApp — solo el proveedor da de alta inmobiliarias).
 */
export default function Home() {
  const whatsappHref = buildWhatsappLink(
    `Hola! Quiero publicar mi inmobiliaria en ${brand.name}.`
  );

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
          <UserMenu compact />
          <ThemeToggle />
        </div>
      </header>

      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <h1 className="max-w-3xl text-balance font-display text-[clamp(2.25rem,6vw,4rem)] font-bold leading-[1.05] text-text">
          {brand.tagline}
        </h1>
        <p className="mt-5 max-w-xl text-balance text-lg text-text-muted">{brand.description}</p>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <Link href="/mapa" className={buttonClasses("primary", "lg", "sm:min-w-[200px]")}>
            Explorar propiedades
          </Link>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses("secondary", "lg", "sm:min-w-[200px]")}
          >
            Publicá tu inmobiliaria
          </a>
        </div>
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
