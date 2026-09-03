import Link from "next/link";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils/cn";

/**
 * Marca: un vano de puerta — el umbral que se cruza para "entrar" a la
 * propiedad. Hereda currentColor, así que el color se controla desde afuera.
 */
export function Logo({ className, href = "/" }: { className?: string; href?: string | null }) {
  const mark = (
    <span className={cn("inline-flex items-center gap-2 font-display text-lg font-bold text-text", className)}>
      <svg viewBox="0 0 24 24" className="h-6 w-6 text-accent" fill="none" aria-hidden>
        <path
          d="M4 21V10a8 8 0 0 1 16 0v11"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M4 21h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {brand.name}
    </span>
  );

  if (!href) return mark;
  return (
    <Link href={href} aria-label={`${brand.name} — inicio`} className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
      {mark}
    </Link>
  );
}
