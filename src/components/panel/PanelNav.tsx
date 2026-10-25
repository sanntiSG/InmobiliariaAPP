"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";

export type NavItem = {
  href: string;
  label: string;
  /** Se marca activo sólo con la dirección exacta (el inicio del panel). */
  exact?: boolean;
  /** Cantidad pendiente para mostrar en un globo (0 o ausente: sin globo). */
  badge?: number;
  /** Direcciones que también lo dejan marcado (secciones que se movieron o cuelgan de esta). */
  alsoActive?: string[];
};

export type NavGroup = { title?: string; items: NavItem[] };

const AGENCY_RE = /^[a-f0-9]{24}$/i;

function isActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return [item.href, ...(item.alsoActive ?? [])].some((h) => pathname === h || pathname.startsWith(`${h}/`));
}

/** Agrega la inmobiliaria elegida (`?agencyId=`) a los enlaces del panel, para que el admin no la pierda al cambiar de sección. */
function withAgency(href: string, agencyId: string | null): string {
  return agencyId && href.startsWith("/dashboard") ? `${href}${href.includes("?") ? "&" : "?"}agencyId=${agencyId}` : href;
}

function NavList({ groups, ariaLabel, agencyId }: { groups: NavGroup[]; ariaLabel: string; agencyId: string | null }) {
  const pathname = usePathname();
  return (
    <nav aria-label={ariaLabel} className="flex gap-1 overflow-x-auto lg:sticky lg:top-24 lg:w-56 lg:shrink-0 lg:flex-col lg:gap-0 lg:self-start lg:overflow-visible">
      {groups.map((group, gi) => (
        <div key={group.title ?? gi} className="flex shrink-0 gap-1 lg:flex-col lg:[&:not(:first-child)]:mt-6" role="group" aria-label={group.title}>
          {group.title && (
            <p className="hidden px-4 pb-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-subtle lg:block">{group.title}</p>
          )}
          {group.items.map((item) => {
            const active = isActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={withAgency(item.href, agencyId)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "nav-dot flex shrink-0 items-center justify-between gap-2 rounded-pill px-4 py-2.5 text-sm font-medium transition-colors lg:rounded-media",
                  active ? "bg-accent-soft text-accent" : "text-text-muted hover:bg-surface-2 hover:text-text"
                )}
              >
                {item.label}
                {item.badge ? (
                  <span
                    className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-danger-contrast"
                    aria-label={`${item.badge} pendientes`}
                  >
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function NavWithAgency({ groups, ariaLabel, keepAgency }: { groups: NavGroup[]; ariaLabel: string; keepAgency: boolean }) {
  const raw = useSearchParams().get("agencyId");
  return <NavList groups={groups} ariaLabel={ariaLabel} agencyId={keepAgency && raw && AGENCY_RE.test(raw) ? raw : null} />;
}

/**
 * Menú lateral de un panel (en el celular, una tira que se desliza). Los enlaces se agrupan por tema para que se entienda
 * qué hace cada sección. Con `keepAgency` (el admin mirando el panel de una inmobiliaria) conserva la inmobiliaria elegida
 * al cambiar de sección.
 */
export function PanelNav({ groups, ariaLabel, keepAgency = false }: { groups: NavGroup[]; ariaLabel: string; keepAgency?: boolean }) {
  if (!keepAgency) return <NavList groups={groups} ariaLabel={ariaLabel} agencyId={null} />;
  return (
    <Suspense fallback={<NavList groups={groups} ariaLabel={ariaLabel} agencyId={null} />}>
      <NavWithAgency groups={groups} ariaLabel={ariaLabel} keepAgency />
    </Suspense>
  );
}
