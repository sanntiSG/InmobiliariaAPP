import Link from "next/link";
import { Logo } from "./Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { UserMenu } from "@/components/auth/UserMenu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ScrollHeader } from "./ScrollHeader";

const LINKS = [
  { href: "/mapa", label: "Mapa" },
  { href: "/propiedades", label: "Propiedades" },
];

/**
 * Header de sitio, para páginas de contenido (landing, listados). `variant="immersive"` es para las pantallas que
 * ocupan toda la pantalla del celular (listado y ficha de propiedades). La página
 * /mapa NO lo usa: ahí el mapa es full-bleed y la marca vive en un overlay
 * flotante propio (ver MapCanvas) — ver .impeccable.md, principio 4.
 */
export function Navbar({ variant = "default" }: { variant?: "default" | "immersive" }) {
  const bar = (
    <div className="mx-auto flex h-16 max-w-7xl items-center justify-between pl-[max(1rem,var(--safe-left))] pr-[max(1rem,var(--safe-right))] sm:pl-[max(1.5rem,var(--safe-left))] sm:pr-[max(1.5rem,var(--safe-right))]">
        <Logo />
        <nav className="hidden items-center gap-6 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="nav-link text-sm font-medium text-text-muted transition-colors hover:text-text"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <NotificationBell />
          <UserMenu compact />
          <ThemeToggle />
        </div>
    </div>
  );

  // Pantalla completa (listado y ficha): header fijo, sin línea, que se oculta al bajar. El resto de las páginas
  // conserva el header pegado arriba de siempre. Ver ScrollHeader.
  if (variant === "immersive") return <ScrollHeader>{bar}</ScrollHeader>;

  return <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur-md">{bar}</header>;
}
