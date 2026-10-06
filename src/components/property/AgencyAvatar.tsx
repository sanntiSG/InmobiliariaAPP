import Image from "next/image";
import { cn } from "@/lib/utils/cn";

/** Logo de la inmobiliaria, o sus iniciales si todavía no cargó uno. */
export function AgencyAvatar({
  name,
  logo,
  size = 36,
  className,
}: {
  name: string;
  logo?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft font-display font-semibold text-accent",
        className
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {logo ? <Image src={logo} alt="" fill sizes={`${size}px`} className="object-cover" /> : initials}
    </span>
  );
}
