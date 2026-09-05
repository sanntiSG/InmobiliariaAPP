"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

const LINKS = [
  { href: "/admin", label: "Inmobiliarias", exact: true },
  { href: "/admin/accesos", label: "Accesos" },
  { href: "/admin/estadisticas", label: "Estadísticas" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto lg:w-56 lg:shrink-0 lg:flex-col lg:overflow-visible">
      {LINKS.map((link) => {
        const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "shrink-0 rounded-pill px-4 py-2.5 text-sm font-medium transition-colors lg:rounded-media",
              active ? "bg-accent-soft text-accent" : "text-text-muted hover:bg-surface-2 hover:text-text"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
