import Link from "next/link";
import { LayoutDashboard, Building2, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { PanelLink } from "@/lib/auth/panel-link";

const ICONS = {
  dashboard: LayoutDashboard,
  onboarding: Building2,
  admin: ShieldCheck,
  espacio: Sparkles,
} as const;

/**
 * Atajo al panel de cada persona. Con `iconOnly` queda un círculo de 40px
 * (mobile, para no robarle espacio al mapa); si no, ícono + texto.
 */
export function PanelLinkButton({
  link,
  iconOnly = false,
  className,
}: {
  link: PanelLink;
  iconOnly?: boolean;
  className?: string;
}) {
  const Icon = ICONS[link.kind];
  return (
    <Link
      href={link.href}
      aria-label={iconOnly ? link.label : undefined}
      title={iconOnly ? link.label : undefined}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-pill text-sm font-medium text-accent",
        "transition-[transform,background-color] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.97]",
        "hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        iconOnly ? "size-10" : "h-9 px-3",
        className
      )}
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden />
      {!iconOnly && <span>{link.label}</span>}
    </Link>
  );
}
