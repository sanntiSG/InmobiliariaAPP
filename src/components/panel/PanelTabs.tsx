import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export type PanelTab = { id: string; label: string; href: string; count?: number };

/**
 * Pestañas de una sección del panel. Son enlaces (`?vista=`), no estado del navegador: se pueden compartir, funcionan con
 * el botón "atrás" y no necesitan JavaScript. El que está activo lo decide la página.
 */
export function PanelTabs({ tabs, active, ariaLabel }: { tabs: PanelTab[]; active: string; ariaLabel: string }) {
  return (
    <nav aria-label={ariaLabel} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <Link
            key={t.id}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-pill px-4 py-2 text-sm font-medium transition-[background-color,color,transform] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.97]",
              on ? "bg-accent text-accent-contrast" : "bg-surface text-text-muted shadow-pop hover:text-text"
            )}
          >
            {t.label}
            {t.count ? (
              <span className={cn("rounded-full px-1.5 text-[11px] font-semibold", on ? "bg-accent-contrast/20" : "bg-surface-2")}>{t.count > 99 ? "99+" : t.count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
