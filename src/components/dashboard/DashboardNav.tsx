"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NubiIcon } from "@/components/icons/NubiIcon";
import { cn } from "@/lib/utils/cn";
import { modeFor, openAdvisor, useAdvisorState } from "@/components/advisor/store";

const BASE_LINKS = [
  { href: "/dashboard", label: "Resumen", exact: true },
  { href: "/dashboard/propiedades", label: "Propiedades" },
  { href: "/dashboard/clientes", label: "Clientes" },
  { href: "/dashboard/oportunidades", label: "Oportunidades" },
  { href: "/dashboard/contenido", label: "Contenido para redes" },
  { href: "/dashboard/inmobiliaria", label: "Mi inmobiliaria" },
];

const ADMIN_LINK = { href: "/admin", label: "Inmobiliarias", exact: false };

export function DashboardNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? [...BASE_LINKS, ADMIN_LINK] : BASE_LINKS;
  const advisor = useAdvisorState();
  const advisorOn = !!advisor.config?.enabled[modeFor(advisor.account)];

  return (
    <nav className="flex gap-1 overflow-x-auto lg:w-56 lg:shrink-0 lg:flex-col lg:overflow-visible">
      {links.map((link) => {
        const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "nav-dot shrink-0 rounded-pill px-4 py-2.5 text-sm font-medium transition-colors lg:rounded-media",
              active ? "bg-accent-soft text-accent" : "text-text-muted hover:bg-surface-2 hover:text-text"
            )}
          >
            {link.label}
          </Link>
        );
      })}
      {advisorOn && (
        <button
          type="button"
          onClick={(e) => openAdvisor({ origin: e.currentTarget.getBoundingClientRect() })}
          className="flex shrink-0 items-center gap-1.5 rounded-pill px-4 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft lg:rounded-media"
        >
          <NubiIcon className="h-4 w-4" />
          {advisor.config?.displayName ?? "Asesor"}
        </button>
      )}
    </nav>
  );
}
