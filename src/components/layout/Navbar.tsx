import Link from "next/link";
import { Logo } from "./Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { UserMenu } from "@/components/auth/UserMenu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { TrendingUp } from "lucide-react";

const LINKS = [
  { href: "/mapa", label: "Mapa" },
  { href: "/propiedades", label: "Propiedades" },
];

/**
 * Header de sitio, para páginas de contenido (landing, listados). La página
 * /mapa NO lo usa: ahí el mapa es full-bleed y la marca vive en un overlay
 * flotante propio (ver MapCanvas) — ver .impeccable.md, principio 4.
 */
export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-6 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-text-muted transition-colors hover:text-text"
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
    </header>
  );
}
