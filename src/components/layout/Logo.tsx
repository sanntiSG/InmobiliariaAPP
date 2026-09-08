import Link from "next/link";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils/cn";
import { TrendingUp } from "lucide-react";

/**
 * Marca: un vano de puerta — el umbral que se cruza para "entrar" a la
 * propiedad. Hereda currentColor, así que el color se controla desde afuera.
 */
export function Logo({ className, href = "/" }: { className?: string; href?: string | null }) {
  const mark = (
    <span className={cn("inline-flex items-center gap-2 font-display text-lg font-bold text-text", className)}>
      <TrendingUp className="h-6 w-6 text-accent" aria-hidden />
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
