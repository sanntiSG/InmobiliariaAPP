import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { brand } from "@/config/brand";
import { buildWhatsappLink } from "@/config/site";

/**
 * Landing placeholder de esta sesión: la versión completa (los 3 caminos —
 * Explorar / Ingresar / Publicá tu inmobiliaria — con auth funcionando) es
 * la sesión 2 del plan. Acá el único camino ya operativo es "Explorar".
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
        <ThemeToggle />
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

        <div className="mt-4 flex items-center gap-2">
          <Button variant="ghost" size="sm" disabled>
            Iniciar sesión
          </Button>
          <span className="rounded-pill bg-surface-2 px-2.5 py-1 text-xs font-medium text-text-muted">
            Próximamente
          </span>
        </div>
      </div>

      <footer className="relative px-6 pb-8 text-center text-xs text-text-muted">
        {brand.name} — {brand.domainLabel}
      </footer>
    </main>
  );
}
